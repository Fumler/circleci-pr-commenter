import test from 'ava'
import nock from 'nock'

import Commenter from '../src/index'

test('Constructor -- Throws if missing environment variables', async t => {
  process.env.GITHUB_TOKEN = ''
  process.env.CIRCLE_PROJECT_USERNAME = ''
  delete process.env.CIRCLE_PULL_REQUEST
  try {
    new Commenter()
  } catch (error) {
    t.truthy(error)
  }
})

test('createOrUpdateComment - Creates a new comment', async t => {
  process.env.CIRCLE_PROJECT_USERNAME = 'fumler'
  process.env.CIRCLE_PROJECT_REPONAME = 'circleci-pr-commenter'
  process.env.CIRCLE_BRANCH = 'feature/test'
  process.env.CIRCLE_BUILD_URL = 'https://build-url.dev'
  process.env.CIRCLE_PULL_REQUEST = '15'
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_TOKEN_USERNAME = 'tokenuser'
  process.env.CIRCLE_SHA1 = 'xxx'
  process.env.HOME = '/home/circle'

  const scope = nock('https://api.github.com')
    .get('/repos/fumler/circleci-pr-commenter/issues/15/comments')
    .reply(200, [])
    .post('/repos/fumler/circleci-pr-commenter/issues/15/comments')
    .reply(201, function(uri, requestBody) {
      t.deepEqual(requestBody, { body: '\n<!-- start:test -->\nThis is a test.\n<!-- end:test -->\n' })
      return [201, {}]
    })

  const commenter = new Commenter()
  await commenter.createOrUpdateComment('test', 'This is a test.')

  const buildURL = commenter.getArtifactURL('/path')
  t.is(buildURL, `https://build-url.dev/artifacts/0/home/circle/path`)

  t.truthy(scope.isDone())
})

test('createOrUpdateComment - Updates a comment without existing key', async t => {
  process.env.CIRCLE_PROJECT_USERNAME = 'fumler'
  process.env.CIRCLE_PROJECT_REPONAME = 'circleci-pr-commenter'
  process.env.CIRCLE_BRANCH = 'feature/test'
  process.env.CIRCLE_BUILD_URL = 'https://build-url.dev'
  process.env.CIRCLE_PULL_REQUEST = '15'
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_TOKEN_USERNAME = 'tokenuser'
  process.env.CIRCLE_SHA1 = 'xxx'
  process.env.HOME = '/home/circle'

  const scope = nock('https://api.github.com')
    .get('/repos/fumler/circleci-pr-commenter/issues/15/comments')
    .reply(200, [
      {
        id: 1,
        user: {
          login: 'tokenuser',
        },
        body: 'This is an exisiting comment.',
      },
    ])
    .patch('/repos/fumler/circleci-pr-commenter/issues/comments/1')
    .reply(function(uri, requestBody) {
      t.deepEqual(requestBody, {
        body: 'This is an exisiting comment.\n\n\n<!-- start:test -->\nThis is a test.\n<!-- end:test -->\n',
      })
      return [200, {}]
    })

  const commenter = new Commenter()
  await commenter.createOrUpdateComment('test', 'This is a test.')

  const buildURL = commenter.getArtifactURL('/path')
  t.is(buildURL, `https://build-url.dev/artifacts/0/home/circle/path`)

  t.truthy(scope.isDone())
})

test('createOrUpdateComment - Updates a comment with existing key', async t => {
  process.env.CIRCLE_PROJECT_USERNAME = 'fumler'
  process.env.CIRCLE_PROJECT_REPONAME = 'circleci-pr-commenter'
  process.env.CIRCLE_BRANCH = 'feature/test'
  process.env.CIRCLE_BUILD_URL = 'https://build-url.dev'
  process.env.CIRCLE_PULL_REQUEST = '15'
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_TOKEN_USERNAME = 'tokenuser'
  process.env.CIRCLE_SHA1 = 'xxx'
  process.env.HOME = '/home/circle'

  const scope = nock('https://api.github.com')
    .get('/repos/fumler/circleci-pr-commenter/issues/15/comments')
    .reply(200, [
      {
        id: 1,
        user: {
          login: 'tokenuser',
        },
        body: 'This is an exisiting comment.<!-- start:test -->This is a keyed comment.<!-- end:test -->',
      },
    ])
    .patch('/repos/fumler/circleci-pr-commenter/issues/comments/1')
    .reply(function(uri, requestBody) {
      t.deepEqual(requestBody, {
        body: 'This is an exisiting comment.<!-- start:test -->This is a updated comment.<!-- end:test -->',
      })
      return [200, {}]
    })

  const commenter = new Commenter()
  await commenter.createOrUpdateComment('test', 'This is a updated comment.')

  const buildURL = commenter.getArtifactURL('/path')
  t.is(buildURL, `https://build-url.dev/artifacts/0/home/circle/path`)

  t.truthy(scope.isDone())
})

test('createOrUpdateComment - Throws if we get error response in getComments', async t => {
  process.env.CIRCLE_PROJECT_USERNAME = 'fumler'
  process.env.CIRCLE_PROJECT_REPONAME = 'circleci-pr-commenter'
  process.env.CIRCLE_BRANCH = 'feature/test'
  process.env.CIRCLE_BUILD_URL = 'https://build-url.dev'
  process.env.CIRCLE_PULL_REQUEST = '15'
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_TOKEN_USERNAME = 'tokenuser'
  process.env.CIRCLE_SHA1 = 'xxx'
  process.env.HOME = '/home/circle'

  const scope = nock('https://api.github.com')
    .get('/repos/fumler/circleci-pr-commenter/issues/15/comments')
    .times(3)
    .reply(500)

  const commenter = new Commenter()
  await t.throwsAsync(commenter.createOrUpdateComment('test', 'This is a test'))
  t.truthy(scope.isDone())
})

test('createOrUpdateComment - Throws if we get error response when creating/updating comment', async t => {
  process.env.CIRCLE_PROJECT_USERNAME = 'fumler'
  process.env.CIRCLE_PROJECT_REPONAME = 'circleci-pr-commenter'
  process.env.CIRCLE_BRANCH = 'feature/test'
  process.env.CIRCLE_BUILD_URL = 'https://build-url.dev'
  process.env.CIRCLE_PULL_REQUEST = '15'
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_TOKEN_USERNAME = 'tokenuser'
  process.env.CIRCLE_SHA1 = 'xxx'
  process.env.HOME = '/home/circle'

  const scope = nock('https://api.github.com')
    .get('/repos/fumler/circleci-pr-commenter/issues/15/comments')
    .reply(200, [])
    .post('/repos/fumler/circleci-pr-commenter/issues/15/comments')
    .reply(500)

  const commenter = new Commenter()
  await t.throwsAsync(commenter.createOrUpdateComment('test', 'This is a test'))
  t.truthy(scope.isDone())
})
