#
# java-tools
#

FROM debian:bookworm-20231009 AS java-tools

RUN apt-get update \
  && apt-get -y --no-install-recommends install openjdk-17-jdk

WORKDIR /opt/java-tools
COPY ./java-tools ./

RUN chmod +x ./gradlew && ./gradlew installDist \
  && chmod a+x ./dist/bin/java-tools

#
# alignment-based conservation
#
# output directories:
# * /opt/alignment-based-conservation
# * /opt/alignment-based-conservation-dependencies
#

FROM debian:bookworm-20231009 AS alignment-based-conservation

RUN apt-get update \
  && apt-get -y --no-install-recommends install \
  wget curl ca-certificates \
  make g++ zlib1g-dev

WORKDIR /opt/alignment-based-conservation-dependencies

RUN wget https://ftp.ncbi.nlm.nih.gov/blast/executables/blast+/2.9.0/ncbi-blast-2.9.0+-x64-linux.tar.gz -q \
  && ls -l . \
  && tar -xzf ncbi-blast-2.9.0+-x64-linux.tar.gz \
  && rm ./ncbi-blast-2.9.0+-x64-linux.tar.gz

RUN wget https://github.com/weizhongli/cdhit/releases/download/V4.8.1/cd-hit-v4.8.1-2019-0228.tar.gz -q \
  && tar -xzf cd-hit-v4.8.1-2019-0228.tar.gz \
  && cd cd-hit-v4.8.1-2019-0228 \
  && make \
  && cd .. \
  && rm ./cd-hit-v4.8.1-2019-0228.tar.gz

RUN wget http://www.drive5.com/muscle/downloads3.8.31/muscle3.8.31_i86linux64.tar.gz -q \
  && tar -xzf muscle3.8.31_i86linux64.tar.gz \
  && rm ./muscle3.8.31_i86linux64.tar.gz

# TODO Convert into Python 3
RUN wget http://compbio.cs.princeton.edu/conservation/conservation_code.tar.gz -q --no-check-certificate \
  && tar -xzf conservation_code.tar.gz \
  && mv conservation_code jense_shannon_divergence \
  && rm ./conservation_code.tar.gz

RUN chmod -R a+r ./jense_shannon_divergence/matrix

COPY ./conservation/alignment_based /opt/alignment-based-conservation

RUN chmod a+x /opt/alignment-based-conservation/conservation_alignment_based.py \
  && chmod a+x /opt/alignment-based-conservation/download_database.py

#
# hmm_based conservation
#
# output directories:
# * /opt/hmm-based-conservation
# * /opt/hmm-based-conservation-dependencies
#

FROM debian:bookworm-20231009 AS hmm-based-conservation

RUN apt-get update \
  && apt-get -y --no-install-recommends install \
  wget curl ca-certificates \
  python3 python3-pip \
  make g++ zlib1g-dev libgomp1

RUN wget http://eddylab.org/software/hmmer/hmmer-3.3.2.tar.gz -q \
  && tar -xzf hmmer-3.3.2.tar.gz \
  && mv hmmer-3.3.2/ hmmer-3.3.2-build/ \
  && cd hmmer-3.3.2-build/ \
  && ./configure --prefix /opt/hmm-based-conservation-dependencies/hmmer-3.3.2/ \
  && make \
  && make install \
  && cd easel/ \
  && make install \
  && cd ../../ \
  && rm -r hmmer-3.3.2-build/ hmmer-3.3.2.tar.gz

COPY ./conservation/hmm_based /opt/hmm-based-conservation

RUN chmod a+x /opt/hmm-based-conservation/conservation_hmm_based.py \
  && chmod a+x /opt/hmm-based-conservation/download_database.py

#
# executor-p2rank
#

FROM debian:bookworm-20231009

ARG UID=5988
ARG GID=5988
ARG P2RANK_URL=https://github.com/rdk/p2rank/releases/download/2.5.1/p2rank_2.5.1.tar.gz
ARG CELERY_BROKER_URL="amqp://user-develop:develop@localhost:5672"

RUN apt-get update \
  && apt-get -y --no-install-recommends install \
  wget curl \
  python3 python3-pip python3-venv \
  default-jre \
  libgomp1 vim

# https://github.com/python/cpython/issues/102134
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN addgroup --gid ${GID} user \
  && useradd --uid ${UID} --gid ${GID} user

# Since WORKDIR created with current user (root) we precreate the folders.
RUN mkdir /data \
  && mkdir /data/prankweb && chown user:user /data/prankweb \
  && mkdir /data/conservation && chown user:user /data/conservation \
  && mkdir /opt/alignment-based-conservation && chown user:user /opt/alignment-based-conservation \
  && mkdir /opt/alignment-based-conservation-dependencies && chown user:user /opt/alignment-based-conservation-dependencies \
  && mkdir /opt/hmm-based-conservation && chown user:user /opt/hmm-based-conservation \
  && mkdir /opt/hmm-based-conservation-dependencies && chown user:user /opt/hmm-based-conservation-dependencies \
  && mkdir /opt/p2rank && chown user:user /opt/p2rank \
  && mkdir /opt/java-tools && chown user:user /opt/java-tools \
  && mkdir /opt/executor-p2rank && chown user:user /opt/executor-p2rank \
  && mkdir /tmp/pdb && chown user:user /tmp/pdb \
  && mkdir /tmp/pdb-cache && chown user:user /tmp/pdb-cache

#
# alignment-based-conservation
WORKDIR /opt
COPY --chown=user:user --from=alignment-based-conservation /opt/alignment-based-conservation ./alignment-based-conservation
COPY --chown=user:user --from=alignment-based-conservation /opt/alignment-based-conservation-dependencies ./alignment-based-conservation-dependencies

ENV BLAST_DATABASE="/data/conservation/alignment-based/"

ENV BLASTDMAKEDB_CMD="/opt/alignment-based-conservation-dependencies/ncbi-blast-2.9.0+/bin/makeblastdb"
ENV JENSE_SHANNON_DIVERGANCE_DIR="/opt/alignment-based-conservation-dependencies/jense_shannon_divergence/"
ENV PSIBLAST_CMD="/opt/alignment-based-conservation-dependencies/ncbi-blast-2.9.0+/bin/psiblast"
ENV BLASTDBCMD_CMD="/opt/alignment-based-conservation-dependencies/ncbi-blast-2.9.0+/bin/blastdbcmd"
ENV CDHIT_CMD="/opt/alignment-based-conservation-dependencies/cd-hit-v4.8.1-2019-0228/cd-hit"
ENV MUSCLE_CMD="/opt/alignment-based-conservation-dependencies/muscle3.8.31_i86linux64"

#
# hmm-based-conservation
WORKDIR /opt
COPY --chown=user:user --from=hmm-based-conservation /opt/hmm-based-conservation ./hmm-based-conservation
COPY --chown=user:user --from=hmm-based-conservation /opt/hmm-based-conservation-dependencies ./hmm-based-conservation-dependencies

ENV HMM_SEQUENCE_FILE="/data/conservation/hmm-based/uniref50.fasta"
ENV HMM_CONSERVATION_CACHE="/data/conservation/hmm-based-cache/"

ENV HMMER_DIR="/opt/hmm-based-conservation-dependencies/hmmer-3.3.2/bin/"

# Next lines are also used by java-tools
ENV PDB_DIR="/tmp/pdb/"
ENV PDB_CACHE_DIR="/tmp/pdb-cache/"

#
# p2rank
WORKDIR /opt/p2rank
RUN wget -O p2rank.tar.gz $P2RANK_URL -q \
  && tar -xf p2rank.tar.gz \
  && rm p2rank.tar.gz \
  # p2rank archive contains version, we need to get rid of that
  && mv p2rank_*/* ./ \
  && rm -r p2rank_*

#
# java-tools
WORKDIR /opt
COPY --chown=user:user --from=java-tools /opt/java-tools/dist ./java-tools

ENV JAVA_TOOLS_CMD="/opt/java-tools/bin/java-tools"

#
# prankweb executor

WORKDIR /opt/executor-p2rank
COPY --chown=user:user ./executor-p2rank/requirements.txt ./

RUN pip3 install -r requirements.txt

COPY --chown=user:user ./executor-p2rank/ ./
RUN chmod a+x ./p2rank.sh \
  && chmod a+x ./run_p2rank.py \
  && chmod a+x ./run_p2rank_task.py

#
# administration tools
WORKDIR /opt/administration
COPY --chown=user:user ./administration/requirements.txt ./
RUN pip3 install -r requirements.txt
COPY --chown=user:user ./administration ./

RUN chmod a+x ./create_pdb_database.py

#
# environment
WORKDIR /opt/executor-p2rank
ENV PYTHONPATH="/opt/alignment-based-conservation:/opt/hmm-based-conservation"
USER ${UID}:${GID}
