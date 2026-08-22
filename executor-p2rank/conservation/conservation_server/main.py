#!/usr/bin/env python3
"""
Minimal FastAPI server wrapping the HMM-based conservation computation.
"""

import logging
import os
import sys
import tempfile
import shutil
import traceback

from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

# Add executor-p2rank root to path (same pattern as run_conservation.py:15).
_executor_root = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
if _executor_root not in sys.path:
    sys.path.insert(0, _executor_root)

from conservation.run_conservation import main as run_conservation_main

logger = logging.getLogger("conservation_server")

app = FastAPI(title="Conservation Server")


class ConservationRequest(BaseModel):
    fasta_content: str = Field(
        ...,
        description="Raw FASTA content (header line + sequence).",
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/conservation", response_class=PlainTextResponse)
def compute_conservation(request: ConservationRequest):
    """
    Accept FASTA content, run HMM conservation pipeline, return raw .hom file.

    Sync endpoint — FastAPI runs it in a thread pool automatically,
    so the subprocess-heavy computation does not block the event loop.
    """
    tmp_dir = tempfile.mkdtemp(prefix="conservation_")
    try:
        fasta_path = os.path.join(tmp_dir, "input.fasta")
        with open(fasta_path, "w") as f:
            f.write(request.fasta_content)
            if not request.fasta_content.endswith("\n"):
                f.write("\n")

        working_dir = os.path.join(tmp_dir, "working")
        output_dir = os.path.join(tmp_dir, "output")
        os.makedirs(working_dir)
        os.makedirs(output_dir)

        run_conservation_main({
            "file": fasta_path,
            "working": working_dir,
            "output": output_dir,
        })

        hom_file = os.path.join(output_dir, "input.hom")
        if not os.path.exists(hom_file):
            raise HTTPException(
                status_code=500,
                detail="Conservation computation failed: output file not produced.",
            )

        with open(hom_file) as f:
            return f.read()

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Conservation computation failed.")
        # TODO: Reconsider exposing full traceback in production.
        # Consider returning only a generic error message and logging
        # the traceback server-side only.
        raise HTTPException(status_code=500, detail={
            "error": type(e).__name__,
            "message": str(e),
            "traceback": traceback.format_exc().splitlines(),
        })
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
