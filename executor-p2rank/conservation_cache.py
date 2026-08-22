#!/usr/bin/env python3
#
# Wrap conservation pipeline to provide simple API.
#
import hashlib
import json
import os
import collections
import typing
import logging


def create_hom_from_cache(
        cache_directory: typing.Optional[str],
        fasta_file: str, output_file: str) -> bool:
    if cache_directory is None:
        return False
    logging.info("Fasta file: " + fasta_file)
    sequences = _load_fasta_file(fasta_file)
    if len(sequences) != 1:
        logging.warning(
            "Can't process file as exactly one sequence must be given.")
        return False
    sequence = sequences[0][1]
    conservation = load_from_cache(cache_directory, sequence)
    if conservation is None:
        return False
    logging.info("Using conservation from cache. Writing to file: " + output_file)
    _write_hom_file(output_file, conservation)
    return True


def _load_fasta_file(input_file: str) \
        -> typing.List[typing.Tuple[str, str]]:
    header = None
    result = []
    sequence = ""
    with open(input_file) as stream:
        for line in stream:
            line = line.rstrip()
            if line.startswith(">"):
                if header is None:
                    header = line[1:]
                else:
                    result.append((header, sequence))
                    header = line[1:]
                    sequence = ""
            else:
                sequence += line
    if header is not None:
        result.append((header, sequence))
    return result


def load_from_cache(cache_directory: str, sequence: str):
    if cache_directory is None:
        return None
    group_hash = _hash_sequence(sequence)
    return _read_sequence_from_cache_file(cache_directory, group_hash, sequence)


def _hash_sequence(sequence: str) -> str:
    return hashlib.md5(sequence.encode("ascii")).hexdigest()


def _read_sequence_from_cache_file(
        cache_directory: str, group_hash: str, sequence: str):
    path = os.path.join(cache_directory, group_hash + ".jsonl")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as stream:
        for line in stream:
            content = json.loads(line)
            if content["sequence"] == sequence:
                return content
    return None


def _write_hom_file(path: str, conservation):
    # In our case hom file is just tsv file with three columns.
    with open(path, mode="w", newline="") as stream:
        sequence = conservation["sequence"]
        scores = conservation["score"]
        for (index, aa), score in zip(enumerate(sequence), scores):
            stream.write("\t".join((str(index), score, aa)) + "\n")


def update_cache_from_hom_file(
        cache_directory: str, hom_file: str):
    if cache_directory is None:
        return
    conservation = create_conservation_from_hom_file(hom_file)
    add_to_cache(cache_directory, [conservation])


def create_conservation_from_hom_file(path: str) -> typing.Dict:
    with open(path) as stream:
        sequence = []
        score = []
        for line in stream:
            tokens = line.split()
            sequence.append(tokens[2])
            score.append(tokens[1])
    return {
        "sequence": "".join(sequence),
        "score": score,
    }


def add_to_cache(cache_directory: str, items: typing.List):
    grouped_by_hash = collections.defaultdict(list)
    for item in items:
        grouped_by_hash[_hash_sequence(item["sequence"])].append(item)
    for group_hash, items in grouped_by_hash.items():
        content = _read_cache_file(cache_directory, group_hash)
        # Add only new one.
        sequences = {item["sequence"] for item in content}
        content.extend([
            item for item in items
            if item["sequence"] not in sequences])
        write_cache_file(cache_directory, group_hash, content)


def _read_cache_file(cache_directory: str, group_hash: str):
    path = os.path.join(cache_directory, group_hash + ".jsonl")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as stream:
        return [
            json.loads(line)
            for line in stream
        ]


def write_cache_file(cache_directory: str, group_hash: str, content):
    os.makedirs(cache_directory, exist_ok=True)
    path = os.path.join(cache_directory, group_hash + ".jsonl")
    swap_path = path + ".swp"
    with open(swap_path, "w", encoding="utf-8") as stream:
        for record in content:
            json.dump(record, stream, ensure_ascii=False)
            stream.write("\n")
    os.replace(swap_path, path)
