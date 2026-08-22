# Conservation

Tools for computing HMM-based conservation scores for protein sequences (without running P2Rank predictions).
All tools are designed to run inside the `executor-p2rank` Docker image for now.

## Conservation server

A FastAPI web server that exposes conservation computation as an HTTP endpoint.

### Running the server using Docker

```bash
# to avoid running docker as root, add current user to docker group (you may need to log out and back in for this to take effect)
sudo usermod -aG docker $USER

# prepare data/cache directory on the host
mkdir -p /ssd/p2rank-conservation-docker-data/hmm-based

# download latest uniref database
cd /ssd/p2rank-conservation-docker-data/hmm-based
wget https://ftp.expasy.org/databases/uniprot/current_release/uniref/uniref50/uniref50.fasta.gz && gunzip uniref50.fasta.gz

# alternatively you can download the database inside the container using download_database.py script from prankweb
# but this downloads old version of uniref50 (from 2023-11-01). Might be useful for reproducibility of old results.
docker compose run -it --rm -p 8030:8030 \
    --user "$(id -u):$(id -g)" \
    -v /ssd/p2rank-conservation-docker-data:/data/conservation \
    conservation-server bash
/opt/hmm-based-conservation/download_database.py
# exit container

# build/rebuild docker image (only necessary after changes in this repo)
docker compose build conservation-server

# run server with mounted data directory
docker compose run --rm -p 8030:8030 \
    --user "$(id -u):$(id -g)" \
    -v /ssd/p2rank-conservation-docker-data:/data/conservation \
    conservation-server
```

The server starts on port 8030.
Check API documentation at http://localhost:8030/docs .

To run with more workers for concurrent requests:

```bash
docker compose run --rm -p 8030:8030 conservation-server \
  uvicorn conservation.conservation_server.main:app \
    --host 0.0.0.0 --port 8030 --workers 8
```

Set `--workers` to `n_cpu * 2` for CPU-bound workloads.

### Endpoints

#### GET /health

Returns `{"status": "ok"}` when the server is running.

```bash
curl http://localhost:8030/health
```

#### POST /conservation

Accepts FASTA content, runs the HMM conservation pipeline, returns the raw
`.hom` file as plain text.

Request body (JSON):
```json
{
  "fasta_content": ">sp|P00520|ABL1_MOUSE\nMLPPGPLLLLLLLSGTARLFS"
}
```

Response (text/plain):
```
0	0.583	M
1	1.247	L
2	0.891	P
...
```

Example:

```bash
curl -X POST http://localhost:8030/conservation \
  -H "Content-Type: application/json" \
  -d '{"fasta_content": ">test\nGSMSDQEAKPSTEDLGDKKEGEYIKLKVIGQDSSEIHFKVKMTTHLKKLKESYCQRQGVPMNSLRFLFEGQRIADNHTPKELGMEEEDVIEVYQEQTGGHSTV"}'
```

### Interactive API docs

FastAPI auto-generates interactive API documentation at:

- Swagger UI: http://localhost:8030/docs
- ReDoc: http://localhost:8030/redoc

## Contents

- `run_conservation.py` -- CLI script that computes conservation for a single FASTA file.
- `calculate_conservations_batch.sh` -- Batch script that runs `run_conservation.py` in parallel over a directory of FASTA files.
- `conservation_server/` -- FastAPI web server that exposes conservation computation via HTTP.

## Data directory

The conservation pipeline requires the HMM sequence database and optionally
a cache directory. Inside the Docker container these are configured via
environment variables baked into the image:

| Variable | Default in image | Description |
|---|---|---|
| `HMM_SEQUENCE_FILE` | `/data/conservation/hmm-based/uniref50.fasta` | UniRef50 FASTA database used by HMMER |
| `HMM_CONSERVATION_CACHE` | `/data/conservation/hmm-based-cache/` | Directory for caching computed scores |
| `HMMER_DIR` | `/opt/hmm-based-conservation-dependencies/hmmer-3.3.2/bin/` | Path to HMMER binaries (phmmer, esl-weight, esl-alistat) |

The database files are stored in the `prankweb_conservation` Docker volume,
mounted at `/data/conservation` inside the container.

## Building the Docker image

The image is built from the project root (not from this directory) because
the Dockerfile references multiple project directories:

```bash
cd /path/to/prankweb   # project root containing docker-compose.yml
docker compose build conservation-server
```

This uses the same multi-stage `executor-p2rank/Dockerfile` that builds
HMMER, BLAST, and other dependencies from source.

## run_conservation.py

Computes HMM-based conservation for a single FASTA file.

```
./run_conservation.py --file /path/to/input.fasta --output /path/to/output --working /tmp/work
```

Arguments:
- `--file` -- Path to a FASTA file containing a single protein sequence.
- `--output` -- Directory where the `.hom` output file will be written (default: `./`).
- `--working` -- Temporary working directory for intermediate HMMER files (default: `./working`).

Output is a `.hom` file (TSV with columns: position index, conservation score, amino acid).
The file is named after the input: `input.fasta` produces `input.hom`.

Example inside Docker:

```bash
docker compose run --rm conservation-server \
  python conservation/run_conservation.py \
    --file /data/conservation/example.fasta \
    --output /tmp/out \
    --working /tmp/work
```

## calculate_conservations_batch.sh

Batch wrapper that finds all `.fasta` files in a directory and processes them
in parallel using `xargs -P`.

```
./calculate_conservations_batch.sh <n_processes> <input_dir> <output_dir>
```

Arguments:
1. Number of parallel processes.
2. Input directory containing `.fasta` files.
3. Output directory for `.hom` files.

Example inside Docker:

```bash
docker compose run --rm conservation-server \
  bash conservation/calculate_conservations_batch.sh 4 /data/input /data/output
```
