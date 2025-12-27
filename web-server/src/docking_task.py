import os
import flask
import time
import json
import datetime
import dataclasses
import typing
import re
import werkzeug.utils

from .commons import extensions
from .celery_client import submit_directory_for_docking

@dataclasses.dataclass
class TaskInfo:
    # Directory with given task.
    directory: str
    # User identifier of given task.
    identifier: str
    # Data for given task.
    data: typing.Optional[dict] = None
    # Task numeric identifier - decided by the server.
    taskId: typing.Optional[int] = None

class DockingTask:
    """
    Class for handling docking tasks. Prepares directories and files for given task to get executed by Celery.
    """
    # Database name.
    database_name: str
    # Root directory for all tasks.
    root_path: str

    def __init__(self, database_name: str):
        """
        Constructor for DockingTask class, initializes the root path.
        """
        self.database_name = database_name
        self.root_path = os.path.join(self._get_docking_task_directory(), self.database_name)

    def get_file_with_post_param(self, prediction_id: str, file_name: str, data_hash: str):
        """
        Gets a file from a task with a given identifier and a given file name.
        """
        directory = self._get_directory(prediction_id)
        if directory is None or not os.path.isdir(directory):
            return "", 404
    
        try:
            #we have to find the task id in the info file
            with open(_info_file_str(directory), "r") as f:
                found = False
                fileData = json.load(f)
                for task in fileData["tasks"]:
                    if task["initialData"]["hash"] == data_hash:
                        directory = os.path.join(directory, str(task["id"]))
                        found = True
                        break
                if not found: #could not find the task in the info file
                    return "", 404
        
        except OSError:
            return "", 500
        
        #if we successfully found the task directory, we can return the file, if it exists

        public_directory = os.path.join(directory, "public")
        file_name = self._secure_filename(file_name)
        file_path = os.path.join(public_directory, file_name)
        if os.path.isfile(file_path):
            return self._response_file(public_directory, file_name)
        return "", 404
    
    @staticmethod
    def _secure_filename(file_name: str) -> str:
        """
        Sanitizes the given file name.
        """
        return werkzeug.utils.secure_filename(file_name)

    def post_task(self, prediction_id: str, data: dict):
        """
        Posts a task with a given identifier and given data.
        Updates/creates the info file, saves the input data and submits the task to Celery.
        """
        directory = self._get_directory(prediction_id)
        if directory is None:
            return "", 404

        if data is None: #user did not provide any data with the post request
            return "", 400

        required_fields = ["hash", "pocket", "smiles", "exhaustiveness", "bounding_box"]
        for field in required_fields:
            if field not in data:
                return f"Field {field} is missing.", 400
        
        # those boundaries are arbitrary - given in the tsx task file
        if len(data["smiles"]) > 300:
            return "The requested SMILES is too long.", 400

        try:
            exhaustiveness = int(data["exhaustiveness"])
            # the exhaustiveness parameter must be a number between 1 and 64
            if exhaustiveness < 1 or exhaustiveness > 64:
                raise ValueError
        except ValueError:
            return "The exhaustiveness parameter must be a number between 1 and 64.", 400

        taskinfo = TaskInfo(directory=directory, identifier=prediction_id, data=data)

        if os.path.exists(directory) and os.path.exists(_info_file(taskinfo)):
            #if the info file exists, we have to append the new info to the existing file
            try:
                with open(_info_file(taskinfo), "r+") as f:
                    fileData = json.load(f)
                    #we check if the task already exists
                    for task in fileData["tasks"]:
                        if task["initialData"]["hash"] == data["hash"]:
                            return self._response_file(directory, "info.json")

                    taskinfo.taskId = len(fileData["tasks"])
                    fileData["tasks"].append(_create_info(taskinfo))
                    f.seek(0)
                    f.write(json.dumps(fileData))
                
                _save_input(taskinfo, data)
                submit_directory_for_docking(taskinfo.directory, taskinfo.taskId)
                return self._response_file(taskinfo.directory, "info.json")
            except:
                #something went wrong on our side
                return "", 500
        
        #else we create a new info file
        os.makedirs(directory, exist_ok=True)
        taskinfo = TaskInfo(directory=directory, identifier=prediction_id, data=data, taskId=0)
        _save_input(taskinfo, data)
        return _create_docking_task_file(taskinfo)
    
    def get_all_tasks(self, prediction_id: str):
        """
        Returns the info file for a given prediction.
        """
        directory = self._get_directory(prediction_id)
        if directory is None:
            return "", 404
        if os.path.exists(directory) and os.path.exists(_info_file_str(directory)):
            return self._response_file(directory, "info.json")
        
        return "", 404
    
    def get_log(self, prediction_id: str, data_hash: str):
        """
        Gets the log file for a task with a given identifier and hash.
        """
        directory = self._get_directory(prediction_id)
        if directory is None or not os.path.isdir(directory):
            return "", 404

        try:
            # Find the task id in the info file
            with open(_info_file_str(directory), "r") as f:
                found = False
                fileData = json.load(f)
                for task in fileData["tasks"]:
                    if task["initialData"]["hash"] == data_hash:
                        directory = os.path.join(directory, str(task["id"]))
                        found = True
                        break
                if not found:
                    return "", 404
        except (OSError, json.JSONDecodeError, KeyError):
            return "", 500

        # check if log file exists in public directory (for failed tasks) or in task directory
        # public/log - copied there when tasks fail
        log_file_public = os.path.join(directory, "public", "log")
        # fallback location: log - for backward compatibility with old failed tasks,
        # edge cases where copy failed, or future access to logs of running/successful tasks
        log_file_private = os.path.join(directory, "log")

        if os.path.isfile(log_file_public):
            return self._response_file(os.path.join(directory, "public"), "log", mimetype="text/plain")
        elif os.path.isfile(log_file_private):
            return self._response_file(directory, "log", mimetype="text/plain")

        return "", 404
    
    def _get_directory(self, prediction_id: str) -> typing.Optional[str]:
        """
        Returns a directory for a task with given prediction ID.
        """
        if not re.match(r"[_,\w]+", prediction_id):
            return None
        if "user-upload" in self.database_name:
            return os.path.join(self.root_path, prediction_id)
        directory = prediction_id[1:3]
        return os.path.join(self.root_path, directory, prediction_id)        
    
    def _response_file(self, directory: str, file_name: str, mimetype=None):
        """
        Returns a file from a given directory.
        """
        if mimetype is None:
            mimetype = self._mime_type(file_name)
        return flask.send_from_directory(directory, file_name, mimetype=mimetype)

    def _get_docking_task_directory(self) -> str:
        """
        Returns the root directory for all tasks.
        """
        dc = os.environ.get(
            "PRANKWEB_DATA_DOCKING",
            # For local development.
            os.path.join(os.path.dirname(os.path.realpath(__file__)),
                        "..", "..", "..", "data", "docking"))
        return dc
    
    @staticmethod
    def _mime_type(file_name: str) -> str:
        """
        Detect file mime type.
        """
        ext = file_name[file_name.rindex("."):]
        return extensions.get(ext, "text/plain")

def _save_input(taskinfo: TaskInfo, data: dict):
    """
    Save input data for given task.
    """
    os.makedirs(os.path.join(taskinfo.directory, str(taskinfo.taskId)), exist_ok=True)
    with open(os.path.join(taskinfo.directory, str(taskinfo.taskId), "input.json"), "w+") as f:
        f.write(json.dumps(data))

def _info_file(taskinfo: TaskInfo) -> str:
    """
    Returns a path to info file for given task.
    """
    return os.path.join(taskinfo.directory, "info.json")

def _info_file_str(directory: str) -> str:
    """
    Returns a path to info file for given task.
    """
    return os.path.join(directory, "info.json")

def _prepare_prediction_directory(taskinfo: TaskInfo):
    """
    Initialize contents of a directory for given task.
    This only happens once per prediction for one type of a task.
    """
    taskinfo.taskId = 0
    info = _create_info(taskinfo)
    json_info_skeleton = {"tasks": [info], "identifier": taskinfo.identifier}
    _save_json(_info_file(taskinfo), json_info_skeleton)
    return info

def _save_json(path: str, content: typing.Any):
    """
    Saves content as a JSON file.
    """
    with open(path, "w", encoding="utf-8") as stream:
        json.dump(content, stream, ensure_ascii=True)

def _create_info(taskinfo: TaskInfo):
    """
    Returns a JSON object with info about one task.
    """
    if taskinfo.data is None:
        raise ValueError("TaskInfo.data cannot be None when creating task info")
    
    now = datetime.datetime.today().strftime("%Y-%m-%dT%H:%M:%S")
    return {
        "id": taskinfo.taskId,
        "created": now,
        "lastChange": now,
        "status": "queued",
        "initialData": {
            "hash": taskinfo.data["hash"],
            "pocket": taskinfo.data["pocket"],
            "smiles": taskinfo.data["smiles"],
            "exhaustiveness": taskinfo.data["exhaustiveness"],
        }
    }

def _create_docking_task_file(taskinfo: TaskInfo, force=False):
    """
    Creates a directory for a task and initializes it.
    """
    try:
        os.makedirs(taskinfo.directory, exist_ok=True)
    except OSError:
        if not force:
            return _prediction_can_not_be_created(taskinfo)
    info = _prepare_prediction_directory(taskinfo)
    submit_directory_for_docking(taskinfo.directory, taskinfo.taskId)
    return flask.make_response(flask.jsonify(info), 201)

def _prediction_can_not_be_created(taskinfo: TaskInfo):
    """
    Handles a situation when a prediction can not be created.
    """
    # Not the best, but it is possible that someone else created
    # the task before us, so we wait some time, so they can finish the
    # initialization.
    time.sleep(1)
    if os.path.isdir(taskinfo.directory) and \
            os.path.isfile(_info_file(taskinfo)):
        # Somebody else created the task.
        return flask.send_from_directory(
            taskinfo.directory, "info.json",
            mimetype="application/json")
    else:
        return "", 500
    
if __name__ == "__main__":
    pass
