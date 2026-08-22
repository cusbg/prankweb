#!/bin/bash

n_proc=$1
input_dir=$2
output_dir=$3

work_dir="${output_dir}/.work_dir"

n=$(find "$input_dir" -name "*.fasta" | wc -l)

echo "processing $n fasta files"

mkdir -p "$output_dir"
mkdir -p "$work_dir"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

find "$input_dir" -name "*.fasta" | xargs -P "${n_proc}" -I{} "$SCRIPT_DIR/run_conservation.py" --file {} --output "$output_dir" --working "$work_dir"

echo "processed $n fasta files"
echo "output_dir: $output_dir"
echo Done.
