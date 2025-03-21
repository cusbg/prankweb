import os
import json

def main():
    """
    This script is used to fix the status of the docking tasks that are in the "queued" status.
    It will change the status to "failed" and set the hash to "undefined" (to allow the task to be re-queued).

    Run this script in the root directory of the tasks (e.g. /data/prankweb/docking).
    """
    for root, dirs, files in os.walk("."):
        for file in files:
            if file == "info.json":
                try:
                    with open(os.path.join(root, file), "r") as f:
                        changed = False
                        content = json.load(f)
                        if "tasks" in content:
                            for task in content["tasks"]:
                                if task["status"] == "queued":
                                    task["initialData"]["hash"] = "undefined"
                                    task["status"] = "failed"
                                    changed = True

                    if changed:
                        print("Changing file: ", os.path.join(root, file))
                        with open(os.path.join(root, file), "w") as f:
                            json.dump(content, f)

                except Exception as e:
                    print(f"Error in file {os.path.join(root, file)}: {e}")

if __name__ == "__main__":
    main()