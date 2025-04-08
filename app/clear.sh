#! /bin/env bash

rm -rf ios/Pods ios/Podfile.lock node_modules .expo .yarn
watchman watch-del-all
yarn cache clean

yarn install
npx pod-install

npx expo prebuild
