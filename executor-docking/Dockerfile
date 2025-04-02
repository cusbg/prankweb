#
# executor-docking
#

FROM ubuntu:24.04

ARG UID=5988
ARG GID=5988
ARG CELERY_BROKER_URL="amqp://user-develop:develop@localhost:5672"
# To prevent apt-get install from asking questions
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    wget \
    python3 \
    python3-pip \
    python3-venv \
    openbabel \
    libopenbabel-dev nano \
    software-properties-common \
    build-essential \
    libssl-dev \
    zlib1g-dev \
    libncurses5-dev \
    libncursesw5-dev \
    libreadline-dev \
    libsqlite3-dev \
    libgdbm-dev \
    libdb5.3-dev \
    libbz2-dev \
    libexpat1-dev \
    liblzma-dev \
    tk-dev \
    libffi-dev

# https://github.com/python/cpython/issues/102134
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN groupadd --gid ${GID} user \
    && useradd --uid ${UID} --gid ${GID} user

# Since WORKDIR created with current user (root) we precreate the folders.
RUN mkdir /data \
    && mkdir /data/prankweb && chown user:user /data/prankweb \
    && mkdir /opt/executor-docking && chown user:user /opt/executor-docking 

# Prankweb executor-docking
WORKDIR /opt/executor-docking

RUN wget https://www.python.org/ftp/python/2.7.18/Python-2.7.18.tgz && \
    tar xzf Python-2.7.18.tgz && \
    rm Python-2.7.18.tgz && \
    cd Python-2.7.18 && \
    ./configure --enable-optimizations && \
    make altinstall

RUN curl https://bootstrap.pypa.io/pip/2.7/get-pip.py -o get-pip.py && \
    python2.7 get-pip.py

RUN python2.7 -m pip install numpy

RUN wget -q https://vina.scripps.edu/wp-content/uploads/sites/55/2020/12/autodock_vina_1_1_2_linux_x86.tgz && \
    tar -xzvf autodock_vina_1_1_2_linux_x86.tgz && \
    rm autodock_vina_1_1_2_linux_x86.tgz && \
    mv autodock_vina_1_1_2_linux_x86 /opt/vina && \
    ln -s /opt/vina/bin/vina /usr/local/bin/vina

RUN curl -L -o mgltools_x86_64Linux2_1.5.7p1.tar.gz https://ccsb.scripps.edu/mgltools/download/491/ && \
    tar -xzf mgltools_x86_64Linux2_1.5.7p1.tar.gz && \
    rm mgltools_x86_64Linux2_1.5.7p1.tar.gz && \
    mv mgltools_x86_64Linux2_1.5.7 /opt/mgltools_x86_64Linux2_1.5.7 && \
    tar -xzf /opt/mgltools_x86_64Linux2_1.5.7/MGLToolsPckgs.tar.gz -C /opt/mgltools_x86_64Linux2_1.5.7/ && \
    rm /opt/mgltools_x86_64Linux2_1.5.7/MGLToolsPckgs.tar.gz

ENV PATH="/opt/mgltools_x86_64Linux2_1.5.7/MGLToolsPckgs/AutoDockTools/Utilities24/:${PATH}"
ENV PYTHONPATH="/opt/mgltools_x86_64Linux2_1.5.7/MGLToolsPckgs/:${PYTHONPATH}"

# A trick to work around a bug in MolKit MMCIF parser (MolKit/__init__.py calls MMCIFParser with an argument modelsAs=True, which is not supported by the parser)
RUN sed -i 's/^        parser = MMCIFParser(filename, modelsAs=modelsAs)$/        parser = MMCIFParser(filename)/' /opt/mgltools_x86_64Linux2_1.5.7/MGLToolsPckgs/MolKit/__init__.py

# Install dodo (docking in docker)
# https://github.com/kiarka7/DODO
RUN wget -q https://raw.githubusercontent.com/kiarka7/DODO/5de5fa13b262dafe7e3e49160994a1b1b5f31bfd/run_docking.py -O /opt/executor-docking/run_docking.py

COPY --chown=user:user ./executor-docking/requirements.txt ./
RUN pip3 install -r requirements.txt

COPY --chown=user:user ./executor-docking/ ./
RUN chmod a+x ./run_task.py

#
# environment
WORKDIR /opt/executor-docking
USER ${UID}:${GID}
