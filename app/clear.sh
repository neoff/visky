#! /bin/env bash

#rm -rf ios/Pods ios/Podfile.lock node_modules .expo .yarn
rm -rf android .expo .expo-shared node_modules
watchman watch-del-all
yarn cache clean

yarn install
npx pod-install

npx expo prebuild
