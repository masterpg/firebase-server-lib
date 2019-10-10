#!/bin/sh -e

ESLINT="./node_modules/.bin/eslint"

if [ -z $1 ]; then
  $ESLINT --fix ./ --ext .js,.ts,.vue
else
  if [ -d $1 ]; then
    $ESLINT --fix "$1" --ext .js,.ts,.vue
  elif [ -e $1 ]; then
    $ESLINT --fix "$1"
  else
    echo "Directory or File \"$1\" not exists."
    exit 1
  fi
fi
