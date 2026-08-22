#!/usr/bin/env python3

import argparse
import os
import subprocess
import random
import typing

HMMER_DIR = os.environ.get("HMMER_DIR", "")

HMM_SEQUENCE_FILE = os.environ.get("HMM_SEQUENCE_FILE", None)


def _read_arguments() -> typing.Dict[str, str]:
    parser = argparse.ArgumentParser(
        description="Compute conservation using HMMER."
    )

    parser.add_argument(
        "fasta_file",
        help="is the input sequence in FASTA format. The first line must be"
             "the header, following lines must contain the sequence. "
             "Only a single header/sequence per file is assumed.")
    parser.add_argument(
        "database_file", default=HMM_SEQUENCE_FILE,
        help="path to a sequence database used to construct the "
             "multiple sequence alignments (MSAs) based on which the IC"
             " is later calculated. It is usually a regular file in a "
             "multiple-sequence FASTA format.")
    parser.add_argument(
        "working_directory",
        help="stores temporary files. The directory is cleaned up"
             " by the script")
    parser.add_argument(
        "target_file",
        help="is the primary output file containing the per-position "
             "IC values.")
    parser.add_argument(
        "--max_seqs", type=int, default=1000,
        help="set size of a random subset of sequences from the initial "
             "(i.e., unweighted) MSA for use in the rest of the pipeline. "
             "The pseudorandom number generator used is initialized using a "
             "fixed seed, making the sequence subset selection reproducible.")
    parser.add_argument(
        "--mask_output", action="store_true",
        help="if set mask certain IC values based on the corresponding "
             "frequencies of the gap (-) character (see readme file).")

    return vars(parser.parse_args())


def main(arguments):
    arguments['execute_command'] = _default_execute_command
    compute_conservation(**arguments)


def _default_execute_command(command: str):
    # We do not check return code here.
    subprocess.run(command, shell=True, env=os.environ.copy())


def compute_conservation(
        fasta_file: str,
        database_file: str,
        working_directory: str,
        target_file: str,
        execute_command: typing.Callable[[str], None],
        mask_output: bool,
        max_seqs: int,
):
    if database_file is None:
        raise RuntimeError(
            "HMM sequence database file is not set."
            " Set HMM_SEQUENCE_FILE environment variable.")
    if not os.path.isfile(database_file):
        raise RuntimeError(
            f"HMM sequence database file not found: {database_file}")
    if not os.access(database_file, os.R_OK):
        raise RuntimeError(
            f"HMM sequence database file is not readable: {database_file}")

    unweighted_msa_file = _generate_msa(
        fasta_file, database_file, working_directory, execute_command)

    if max_seqs:
        sample_file = _select_sequences(unweighted_msa_file, max_seqs)
        if sample_file:
            # We have more sequences than we need, so we got file with selected
            # ones, but only names, so we need to prepare the file.
            unweighted_msa_file = _generate_msa_sample(
                unweighted_msa_file, sample_file, execute_command)

    # No matter what we calculate the weights.
    weighted_msa_file = _calculate_sequence_weights(
        unweighted_msa_file, execute_command)

    ic_file, r_file = _calculate_information_content(
        weighted_msa_file, execute_command)
    fasta_file_header, fasta_file_sequence = _read_fasta_file(fasta_file)
    information_content, freqgap = _read_information_content(ic_file, r_file)

    original_target_file = target_file
    if mask_output:
        target_file += ".unmasked"

    if information_content:
        assert len(fasta_file_sequence) == \
               len(information_content) == \
               len(freqgap)
        _write_tsv(target_file, fasta_file_sequence, information_content)
        _write_tsv(target_file + ".freqgap", fasta_file_sequence, freqgap)
    else:  # `information_content` is `None` if no MSA was generated
        filler_values = ["-1000.0" for index in fasta_file_sequence]
        _write_tsv(target_file, fasta_file_sequence, filler_values)
        _write_tsv(target_file + ".freqgap", fasta_file_sequence, filler_values)

    if not mask_output:
        return weighted_msa_file

    _mask_ic_file(
        target_file,
        target_file + ".freqgap",
        original_target_file,
        0.5, "-1000.0",
    )

    return weighted_msa_file


def _generate_msa(
        fasta_file: str, database_file: str, working_directory: str,
        execute_command: typing.Callable[[str], None]
):
    unweighted_msa_file = os.path.join(
        working_directory, os.path.basename(fasta_file)) + ".sto"
    cmd = "{}phmmer -o /dev/null -A {} {} {}".format(
        HMMER_DIR, unweighted_msa_file, fasta_file, database_file)
    execute_command(cmd)
    return unweighted_msa_file


def _select_sequences(unweighted_msa_file: str, max_seqs: int):
    """Return path to file with sequences, may select only some sequences."""
    sequence_names = []
    with open(unweighted_msa_file) as stream:
        for line in stream:
            if line.startswith("#=GS"):
                sequence_names.append(line.split()[1])
    if len(sequence_names) <= max_seqs:
        return None
    selected_sequences_file = unweighted_msa_file + ".ss"
    with open(selected_sequences_file, mode="w") as stream:
        random.seed(666)
        for index in random.sample(sequence_names, k=max_seqs):
            stream.write(index + "\n")
    return selected_sequences_file


def _generate_msa_sample(
        unweighted_msa_file: str, ss_file: str,
        execute_command: typing.Callable[[str], None]
):
    unweighted_msa_sample_file = unweighted_msa_file + ".sample"
    cmd = "{}esl-alimanip -o {} --seq-k {} {}".format(
        HMMER_DIR, unweighted_msa_sample_file, ss_file,
        unweighted_msa_file)
    execute_command(cmd)
    return unweighted_msa_sample_file


def _calculate_sequence_weights(
        unweighted_msa_file: str,
        execute_command: typing.Callable[..., None]
) -> str:
    weighted_msa_file = unweighted_msa_file + ".w"
    cmd = f"{HMMER_DIR}esl-weight {unweighted_msa_file} > {weighted_msa_file}"
    # This may return 25 return code, and it is actually fine
    execute_command(cmd, ignore_return_code=True)
    return weighted_msa_file


def _calculate_information_content(
        weighted_msa_file: str,
        execute_command: typing.Callable[[str], None]
):
    ic_file = weighted_msa_file + ".ic"
    r_file = weighted_msa_file + ".r"
    cmd = "{}esl-alistat --icinfo {} --rinfo {} --weight {}".format(
        HMMER_DIR, ic_file, r_file, weighted_msa_file)
    execute_command(cmd)
    return ic_file, r_file


def _read_fasta_file(fasta_file: str):
    fasta_file_sequence = ""
    with open(fasta_file) as stream:
        fasta_file_header = next(stream).rstrip()
        for line in stream:
            fasta_file_sequence += line.rstrip()
    return fasta_file_header, fasta_file_sequence


def _read_information_content(ic_file: str, r_file: str):
    try:
        with open(ic_file) as stream:
            information_content = [
                line.strip().split()[3]
                for line in stream
                if _should_read_line(line)
            ]
        with open(r_file) as stream:
            freqgap = [
                line.strip().split()[5]
                for line in stream
                if _should_read_line(line)
            ]
        return information_content, freqgap
    except FileNotFoundError:
        return None, None


def _should_read_line(line: str) -> bool:
    return line[0] != "#" and line[0] != "/" and line.lstrip()[0] != "-"


def _write_tsv(target_file: str, fasta_file_sequence: str, feature):
    with open(target_file, mode="w", newline="") as stream:
        for (i, j), value in zip(enumerate(fasta_file_sequence), feature):
            stream.write("\t".join((str(i), value, j)) + "\n")


def _mask_ic_file(
        ic_file: str, freqgap_file: str, target_file: str,
        max_freqgap, mask_string: str):
    with open(ic_file) as ic_stream, \
            open(freqgap_file) as freqgap_stream, \
            open(target_file, mode="w") as target_stream:
        for line_ic, line_freqgap in zip(ic_stream, freqgap_stream):
            index, freqgap, aa = line_freqgap.split("\t")
            if float(freqgap) > max_freqgap:
                target_stream.write("\t".join((index, mask_string, aa)))
            else:
                target_stream.write(line_ic)


if __name__ == "__main__":
    main(_read_arguments())
