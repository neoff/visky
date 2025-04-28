#! /bin/env bash

#!/usr/bin/env bash
if ! docker info > /dev/null 2>&1; then
  echo "This script uses docker, and it isn't running - please start docker and try again!"
  exit 1
fi

## Semver tool

#https://github.com/fsaintjacques/semver-tool
# Download the script and save it to /usr/local/bin
#wget -O /usr/local/bin/semver \
#  https://raw.githubusercontent.com/fsaintjacques/semver-tool/master/src/semver

# Make script executable
#chmod +x /usr/local/bin/semver

# Prove it works
#semver --version

VERSION_CUR=`awk -F'"' '/"version": ".+"/{ print $4; exit; }' package.json`
echo "Current: -${VERSION_CUR}-"
VERSION_NEW=`semver bump patch ${VERSION_CUR}`
echo "Next   : -${VERSION_NEW}-"

## Hand made Semver tool :)
#source ./version.sh
#VERSION_NEW=$(get_next_version patch)
#kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.2/cert-manager.yaml
#helm upgrade frisky-api ./helm --set image.tag=${VERSION_NEW}

git stash

if ! npm version ${VERSION_NEW} > /dev/null 2>&1; then
  echo "Version ${VERSION_CUR}->${VERSION_NEW} not changed!"
  git stash pop
  exit 1
fi
git stash pop

docker build -t varg/vk-frisky-parser:latest -t varg/vk-frisky-parser:${VERSION_NEW} .

docker push varg/vk-frisky-parser:latest && docker push varg/vk-frisky-parser:${VERSION_NEW}

#helm upgrade frisky-api ./helm --set image.tag=${VERSION_NEW}