#!/usr/bin/env python3
#
# Run a docking task.
#
import os
import sys
import datetime
import enum
import json
import time
import glob
import gzip
import shutil
from typing import Any

from run_docking import run_docking

class Status(enum.Enum):
    """
    A class to represent a task status. 
    Notice that those values are written to the info.json file that is used by the frontend,
    so any changes here should be reflected in the frontend as well.
    """
    QUEUED = "queued"
    RUNNING = "running"
    FAILED = "failed"
    SUCCESSFUL = "successful"

class Logger:
    """
    A class to represent a simple logger.
    """
    def __init__(self, log_file: str):
        self.log_file = open(log_file, "w")

    def log(self, message: str):
        self.log_file.write(f"{datetime.datetime.now()} - {message}\n")
        self.log_file.flush()

    def close(self):
        self.log_file.close()

def _load_json(path: str):
    """
    Method to load a json file from a given path.
    """
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)

def _save_status_file(path: str, status: Any, taskId: int):
    """
    Method to save the status file. It will update the lastChange field with the current time.
    """
    now = datetime.datetime.today()
    status["tasks"][taskId]["lastChange"] = now.strftime('%Y-%m-%dT%H:%M:%S')
    _save_json(path, status)

def _save_json(path: str, content: Any):
    """
    Method to save a json file to a given path.
    """
    path_swp = path + ".swp"
    if(os.path.exists(path_swp)):
        time.sleep(1)
    with open(path_swp, "w", encoding="utf-8") as stream:
        json.dump(content, stream, ensure_ascii=True)
    os.replace(path_swp, path)

def get_prediction_directory(docking_directory: str):
    """
    Method to get the path to the prediction directory from the docking directory.
    """
    # currently assuming that the docking and predictions paths are different just by the name
    return str.replace(docking_directory, "docking", "predictions")

def get_prediction_path(docking_directory: str):
    """
    Method to get the path to the prediction file from the docking directory.
    """
    # currently assuming that the docking and predictions paths are different just by the name
    return os.path.join(get_prediction_directory(docking_directory), "public", "prediction.json")

def prepare_docking(input_file: str, structure_file_gzip: str, task_directory: str):
    # unzip the pdb/mmCIF file
    extension = structure_file_gzip.split(".")[-2]
    structureFile = os.path.join(task_directory, ("structure." + extension))

    with gzip.open(structure_file_gzip, 'rb') as f_in:
        with open(structureFile, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)
    
    # create a smiles file from the ligand
    ligandFile = os.path.join(task_directory, "ligand.smi")
    with open(input_file) as inp, open(ligandFile, "w") as f:
        input_json = json.load(inp)
        f.write(input_json["smiles"])

    # prepare the input file
    new_input_file = os.path.join(task_directory, "docking_parameters.json")
    with open(input_file) as inp, open(new_input_file, "w") as out:
        input_json = json.load(inp)
        out_json = {}

        out_json["receptor"] = structureFile
        out_json["ligand"] = ligandFile
        out_json["output"] = os.path.join(task_directory, "public", "out_vina.pdbqt")
        out_json["center"] = input_json["bounding_box"]["center"]
        out_json["size"] = input_json["bounding_box"]["size"]
        out_json["exhaustiveness"] = input_json["exhaustiveness"]

        json.dump(out_json, out)

def execute_directory_task(docking_directory: str, taskId: int):
    """
    Method to execute a task for a given directory and a given taskId.
    """
    log_filename = os.path.join(docking_directory, str(taskId), "log")
    logger = Logger(log_filename)

    result_file = os.path.join(docking_directory, str(taskId), "public", "result.json")

    # check if the directory exists - if not, we did not ask for this task
    # check if the result file exists - if it does, we already calculated it
    if not os.path.exists(docking_directory) or not os.path.isdir(docking_directory) or os.path.exists(result_file):
        logger.close()
        return
    
    # first update the status file
    status_file = os.path.join(docking_directory, "info.json")
    status = _load_json(status_file)

    logger.log(f"Task {taskId} started")
    status["tasks"][taskId]["status"] = Status.RUNNING.value
    _save_status_file(status_file, status, taskId)

    # first, look for the gz file with the structure
    logger.log(f"Looking for structure file in {get_prediction_directory(docking_directory)}")
    structure_file = ""
    for file_path in glob.glob(os.path.join(get_prediction_directory(docking_directory), "public") + "/*.gz"):
        structure_file = file_path
        break

    if structure_file == "":
        # no structure file found, we cannot do anything
        # this should not happen because the structure has to be downloadable for the prediction...
        logger.log(f"Task {taskId} failed, no structure file found")
        logger.close()

        # update the status file, reload it first to make sure we don't overwrite any changes
        status = _load_json(status_file)
        status["tasks"][taskId]["status"] = Status.FAILED.value
        _save_status_file(status_file, status, taskId)
        return
    
    logger.log(f"Structure file found: {structure_file}")

    # try to dock the molecule
    try:
        logger.log(f"Running docking for task {taskId}")
        prepare_docking(os.path.join(docking_directory, str(taskId), "input.json"), structure_file, os.path.join(docking_directory, str(taskId)))
        run_docking(os.path.join(docking_directory, str(taskId), "docking_parameters.json"), os.path.join(docking_directory, str(taskId)), os.path.join(docking_directory, str(taskId)), "public")
    except Exception as e:
        # something went wrong during the docking
        logger.log(f"Task {taskId} failed, {str(e)}, {repr(e)}")
        logger.close()

        # update the status file, reload it first to make sure we don't overwrite any changes
        status = _load_json(status_file)
        status["tasks"][taskId]["status"] = Status.FAILED.value
        _save_status_file(status_file, status, taskId)
        return

    # API is /docking/<database_name>/<prediction_name>/<hash>/public/<file_name>
    # split docking_directory to get database_name and prediction_name
    result = []
    database_name = docking_directory.split("/")[4]
    if "user-upload" in database_name:
        prediction_name = docking_directory.split("/")[5]
    else:
        prediction_name = docking_directory.split("/")[6]

    result_url = "./api/v2/docking/" + database_name + "/" + prediction_name + "/" + status["tasks"][taskId]["initialData"]["hash"] + "/public/results.zip"
    result.append({
        "url": result_url
    })
    result_json = json.dumps(result)

    # save the result file (this directory should already exist, though...)
    os.makedirs(os.path.join(docking_directory, str(taskId), "public"), exist_ok=True)

    logger.log(f"Saving result file to {result_file}")
    with open(result_file, "w", encoding="utf-8") as stream:
        try:
            stream.write(result_json)
        finally:
            stream.flush()

    # copy the docking parameters file to the public directory
    shutil.copy(os.path.join(docking_directory, str(taskId), "docking_parameters.json"), os.path.join(docking_directory, str(taskId), "public", "docking_parameters.json"))
    
    # update the status file, reload it first to make sure we don't overwrite any changes
    status = _load_json(status_file)
    status["tasks"][taskId]["status"] = Status.SUCCESSFUL.value
    _save_status_file(status_file, status, taskId)

    logger.log(f"Task {taskId} successfully finished")
    logger.close()

def main(arguments):
    pass

if __name__ == "__main__":
    main(sys.argv[1:])
