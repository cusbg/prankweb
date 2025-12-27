#!/usr/bin/env python
# coding: utf-8
import datetime
import enum
import time
import glob
import gzip
import shutil
import os
import json
import xml.etree.ElementTree as ET
from pathlib import Path
import subprocess

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

def _save_status_file(path: str, status: dict, taskId: int):
    """
    Method to save the status file. It will update the lastChange field with the current time.
    """
    now = datetime.datetime.today()
    status["tasks"][taskId]["lastChange"] = now.strftime('%Y-%m-%dT%H:%M:%S')
    _save_json(path, status)

def _save_json(path: str, content: dict):
    """
    Method to save a json file to a given path.
    """
    path_swp = path + ".swp"
    if(os.path.exists(path_swp)):
        time.sleep(1)
    with open(path_swp, "w", encoding="utf-8") as stream:
        json.dump(content, stream, ensure_ascii=True)
    os.replace(path_swp, path)

def get_prediction_directory(tunnels_directory: str):
    """
    Method to get the path to the prediction directory from the tunnels directory.
    """
    # currently assuming that the tunnels and predictions paths are different just by the name
    return str.replace(tunnels_directory, "tunnels", "predictions")

def get_prediction_path(tunnels_directory: str):
    """
    Method to get the path to the prediction file from the tunnels directory.
    """
    # currently assuming that the tunnels and predictions paths are different just by the name
    return os.path.join(get_prediction_directory(tunnels_directory), "public", "prediction.json")

def prepare_tunnels(input_file: str, structure_file_gzip: str, task_directory: str):
    # unzip the pdb/mmCIF file
    extension = structure_file_gzip.split(".")[-2]
    structureFile = os.path.join(task_directory, ("structure." + extension))

    with gzip.open(structure_file_gzip, 'rb') as f_in:
        with open(structureFile, 'wb') as f_out:
            shutil.copyfileobj(f_in, f_out)
    
    # prepare the input file
    new_input_file = os.path.join(task_directory, "tunnel_parameters.json")
    with open(input_file) as inp, open(new_input_file, "w") as out:
        input_json = json.load(inp)
        out_json = {}

        out_json["receptor"] = structureFile
        out_json["pocket"] = input_json["pocket"]

        json.dump(out_json, out)

def execute_directory_task(tunnels_directory: str, taskId: int):
    """
    Method to execute a task for a given directory and a given taskId.
    """
    log_filename = os.path.join(tunnels_directory, str(taskId), "log")
    logger = Logger(log_filename)

    result_file = os.path.join(tunnels_directory, str(taskId), "public", "result.json")

    # check if the directory exists - if not, we did not ask for this task
    # check if the result file exists - if it does, we already calculated it
    if not os.path.exists(tunnels_directory) or not os.path.isdir(tunnels_directory) or os.path.exists(result_file):
        logger.close()
        return
    
    # first update the status file
    status_file = os.path.join(tunnels_directory, "info.json")
    status = _load_json(status_file)

    logger.log(f"Task {taskId} started")
    status["tasks"][taskId]["status"] = Status.RUNNING.value
    _save_status_file(status_file, status, taskId)

    # first, look for the gz file with the structure
    logger.log(f"Looking for structure file in {get_prediction_directory(tunnels_directory)}")
    structure_file = ""
    for file_path in glob.glob(os.path.join(get_prediction_directory(tunnels_directory), "public") + "/*.gz"):
        structure_file = file_path
        break

    if structure_file == "":
        # no structure file found, we cannot do anything
        # this should not happen because the structure has to be downloadable for the prediction...
        logger.log(f"Task {taskId} failed, no structure file found")
        logger.close()

        # copy log file to public directory so it can be accessed via API
        os.makedirs(os.path.join(tunnels_directory, str(taskId), "public"), exist_ok=True)
        shutil.copy(log_filename, os.path.join(tunnels_directory, str(taskId), "public", "log"))

        # update the status file, reload it first to make sure we don't overwrite any changes
        status = _load_json(status_file)
        status["tasks"][taskId]["status"] = Status.FAILED.value
        _save_status_file(status_file, status, taskId)
        return
    
    logger.log(f"Structure file found: {structure_file}")

    # try to create tunnels
    try:
        logger.log(f"Running tunnels task {taskId}")
        prepare_tunnels(os.path.join(tunnels_directory, str(taskId), "input.json"), structure_file, os.path.join(tunnels_directory, str(taskId)))
        run_tunnels("/opt/executor-tunnels/Mole2_cmd/mole2.exe", "/opt/executor-tunnels/AF_template.xml", os.path.join(tunnels_directory, str(taskId), "tunnel_parameters.json"), os.path.join(tunnels_directory, str(taskId)), logger)
    except Exception as e:
        # something went wrong during the execution
        logger.log(f"Task {taskId} failed, {str(e)}, {repr(e)}")
        logger.close()

        # copy log file to public directory so it can be accessed via API
        os.makedirs(os.path.join(tunnels_directory, str(taskId), "public"), exist_ok=True)
        shutil.copy(log_filename, os.path.join(tunnels_directory, str(taskId), "public", "log"))

        # update the status file, reload it first to make sure we don't overwrite any changes
        status = _load_json(status_file)
        status["tasks"][taskId]["status"] = Status.FAILED.value
        _save_status_file(status_file, status, taskId)
        return

    # API is /tunnels/<database_name>/<prediction_name>/<hash>/public/<file_name>
    # split tunnels_directory to get database_name and prediction_name
    result = []
    database_name = tunnels_directory.split("/")[4]
    if "user-upload" in database_name:
        prediction_name = tunnels_directory.split("/")[5]
    else:
        prediction_name = tunnels_directory.split("/")[6]

    result_url = "./api/v2/tunnels/" + database_name + "/" + prediction_name + "/" + status["tasks"][taskId]["initialData"]["hash"] + "/public/results.zip"
    result.append({
        "url": result_url
    })
    result_json = json.dumps(result)

    # save the result file (this directory should already exist, though...)
    os.makedirs(os.path.join(tunnels_directory, str(taskId), "public"), exist_ok=True)

    logger.log(f"Saving result file to {result_file}")
    with open(result_file, "w", encoding="utf-8") as stream:
        try:
            stream.write(result_json)
        finally:
            stream.flush()
    
    # update the status file, reload it first to make sure we don't overwrite any changes
    status = _load_json(status_file)
    status["tasks"][taskId]["status"] = Status.SUCCESSFUL.value
    _save_status_file(status_file, status, taskId)

    logger.log(f"Task {taskId} successfully finished")
    logger.close()

def run_tunnels(mole_exe_path: str, xml_template_path: str, json_file: str, output_folder: str, logger: Logger):
    # Create the output folder if it does not exist
    Path(output_folder).mkdir(parents=True, exist_ok=True)

    with open(json_file) as f:
        data = json.load(f)

    logger.log(f"Processing JSON: {json_file}")

    # Get the pocket center and name from the JSON data
    pocket_center = data.get("pocket", {}).get("center")
    pocket_name = data.get("pocket", {}).get("name", "default")

    # If the 'center' is missing in the JSON, skip this file
    if not pocket_center:
        raise ValueError(f"JSON {json_file} does not contain 'center'. Skipping...")

    # Reload the XML template
    tree = ET.parse(xml_template_path)
    root = tree.getroot()

    # Update the XML with the new values from JSON
    origin_element = root.find(".//Origin/Point")
    if origin_element is None:
        raise ValueError("XML template does not contain 'Origin/Point' element")
    
    origin_element.set("X", str(pocket_center[0]))
    origin_element.set("Y", str(pocket_center[1]))
    origin_element.set("Z", str(pocket_center[2]))
    logger.log(f"New Point: X={origin_element.get('X')}, Y={origin_element.get('Y')}, Z={origin_element.get('Z')}")

    # Update the input element with the path to the PDB/CIF file
    input_element = root.find(".//Input")
    if input_element is None:
        raise ValueError("XML template does not contain 'Input' element")

    input_element.text = data.get("receptor", "")
    logger.log(f"New Input: {input_element.text}")

    # Set the working directory based on the pocket name
    working_dir = os.path.abspath(os.path.join(output_folder, f"{pocket_name}"))
    wd = root.find(".//WorkingDirectory")
    if wd is None:
        raise ValueError("XML template does not contain 'WorkingDirectory' element")

    wd.text = working_dir
    logger.log(f"New WorkingDirectory: {working_dir}")

    # Create the working directory for the output files
    Path(working_dir).mkdir(parents=True, exist_ok=True)

    # Save the updated XML to the working directory
    updated_xml_path = os.path.join(working_dir, f"updated_{pocket_name}.xml")
    tree.write(updated_xml_path, encoding="utf-8", xml_declaration=True)
    logger.log(f"XML file saved: {updated_xml_path}")

    # Execute Mole with the updated XML file
    command = ["mono", mole_exe_path, updated_xml_path]
    subprocess.run(command, check=True)

    # copy all files and create a zip archive
    base_dir = os.path.dirname(updated_xml_path)
    os.makedirs(os.path.join(output_folder, "public"), exist_ok=True)
    destination_dir = os.path.join(output_folder, "public")
    
    # Copy data.json separately for easy access
    data_json_path = os.path.join(base_dir, "json", "data.json")
    if os.path.exists(data_json_path):
        shutil.copy(data_json_path, os.path.join(destination_dir, "data.json"))
        logger.log(f"Copied data.json to: {os.path.join(destination_dir, 'data.json')}")
    
    # Copy PDB directory structure for easy access to tunnel PDB files for visualization
    pdb_source_dir = os.path.join(base_dir, "pdb")
    pdb_dest_dir = os.path.join(destination_dir, "pdb")
    if os.path.exists(pdb_source_dir):
        shutil.copytree(pdb_source_dir, pdb_dest_dir, dirs_exist_ok=True)
        logger.log(f"Copied PDB directory to: {pdb_dest_dir}")
    
    # Create zip archive with all results
    shutil.make_archive(os.path.join(destination_dir, "results"), 'zip', base_dir)
    logger.log(f"Results saved to: {os.path.join(destination_dir, 'results.zip')}")

    logger.log(f"Processed: {updated_xml_path}")


def main():
    pass

if __name__ == "__main__":
    # Run the main function if the script is executed directly
    main()
