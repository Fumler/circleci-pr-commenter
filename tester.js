#!/usr/bin/env node

const Commenter = require('./dist/index.js')

const commenter = new Commenter()
commenter.createOrUpdateComment('test', '## Test\n\nTesterino. #9')
