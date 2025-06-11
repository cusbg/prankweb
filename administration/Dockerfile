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
# administration
#

FROM debian:bookworm-20231009

ARG UID=5988
ARG GID=5988

RUN apt-get update \
  && apt-get -y --no-install-recommends install \
  wget curl \
  python3 python3-pip python3-venv \
  openjdk-17-jre-headless \
  libgomp1 vim

# https://github.com/python/cpython/issues/102134
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN addgroup --gid ${GID} user \
  && useradd --uid ${UID} --gid ${GID} user

# Since WORKDIR created with current user (root) we precreate the folders.
RUN mkdir /data \
  && mkdir /opt/java-tools && chown user:user /opt/java-tools \
  && mkdir /opt/administration && chown user:user /opt/administration \
  && mkdir /opt/executor && chown user:user /opt/executor \
  && mkdir /opt/synchronization && chown user:user /opt/synchronization

#
# java-tools
WORKDIR /opt
COPY --chown=user:user --from=java-tools /opt/java-tools/dist ./java-tools

#
# prankweb executor-p2rank
WORKDIR /opt/executor-p2rank
COPY --chown=user:user ./executor-p2rank/ ./

#
# prankweb synchronization
WORKDIR /opt/synchronization
COPY --chown=user:user ./synchronization/ ./
RUN pip3 install -r requirements.txt

#
# prankweb administration
WORKDIR /opt/administration
COPY --chown=user:user ./administration/requirements.txt ./
RUN pip3 install -r requirements.txt
COPY --chown=user:user ./administration/ ./

USER ${UID}:${GID}
ENV PYTHONPATH=$PYTHONPATH:/opt/executor-p2rank
