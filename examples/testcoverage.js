#!/usr/bin/env node
const Commenter = require('../dist/index')
const commenter = new Commenter()
const message = `## Test coverage\n\n[View coverage](${commenter.getArtifactURL(
  '/app/coverage/lcov-report/index.html',
)})`
commenter.createOrUpdateComment('testcoverage', message).catch(err => {
  console.log(err)
})
