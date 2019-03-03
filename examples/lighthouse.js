#!/usr/bin/env node

const fs = require('fs')
const https = require('https')
const lighthouse = require('lighthouse')
const chromeLauncher = require('chrome-launcher')

const Commenter = require('../dist/index')
const commenter = new Commenter()

const BASE_PROD_URL = `https://${commenter.env.repo}.herokuapp.com`
const BASE_REVIEW_URL = `https://${commenter.env.repo}-pr-${commenter.env.pr}.herokuapp.com`
const PROD_URL = `${BASE_PROD_URL}/kongelig/derfor-dukket-dronningen-opp-med-plaster-pa-nesa/70168703?site=www.seher.no`
const REVIEW_URL = `${BASE_REVIEW_URL}/kongelig/derfor-dukket-dronningen-opp-med-plaster-pa-nesa/70168703?site=www.seher.no`
const HEALTH_PROD_URL = `${BASE_PROD_URL}/api/v1/_healthz`
const HEALTH_REVIEW_URL = `${BASE_REVIEW_URL}/api/v1/_healthz`

const BASE_ARTIFACT_PATH = 'lh'
const PROD_ARTIFACT_PATH = `${BASE_ARTIFACT_PATH}/prod.html`
const REVIEW_ARTIFACT_PATH = `${BASE_ARTIFACT_PATH}/review.html`

const runAudit = async (url, opts = {}, config = null) => {
  const chrome = await chromeLauncher.launch({ chromeFlags: opts.chromeFlags })
  opts.port = chrome.port

  const result = await lighthouse(url, opts, config)
  await chrome.kill()

  return result
}

const waitForSiteReady = env => {
  const url = env === 'prod' ? HEALTH_PROD_URL : HEALTH_REVIEW_URL
  let attempts = 0
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (attempts > 29) {
        console.log(`Retried ${env} ${attempts} times, exiting...`)
        clearInterval(interval)
        reject()
      }
      attempts = attempts + 1
      const request = https.request(url, response => {
        if (response.statusCode >= 200 && response.statusCode < 400) {
          clearInterval(interval)
          resolve(true)
        } else {
          console.log(`Site ${url} is not up. Retrying... Attemps: ${attempts}`)
        }
      })
      request.on('error', error => {
        console.log(`Site ${url} is not up. Retrying... Attemps: ${attempts}`)
      })

      request.end()
    }, 5000)
  })
}

const getAuditResult = async (env, outputPath) => {
  const url = env === 'prod' ? PROD_URL : REVIEW_URL
  console.log(`Checking if ${env} is alive...`)
  const isLive = await waitForSiteReady(env)
  if (!isLive) throw new Error(`${env} is not live. Exiting...`)
  console.log(`Running audit for [${url}]...`)
  const result = await runAudit(url, {
    output: ['html', 'json'],
    outputPath: './',
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  })

  if (!fs.existsSync(BASE_ARTIFACT_PATH)) {
    await fs.promises.mkdir(BASE_ARTIFACT_PATH, { recursive: true })
  }
  fs.writeFile(outputPath, result.report[0], err => {
    if (err) {
      throw err
    }
  })

  console.log(`Finished audit for [${url}]... Saved report to ${outputPath}`)
  return result.lhr
}

const main = async () => {
  // recommended to not run these in parallel on bad machines
  const prod = await getAuditResult('prod', PROD_ARTIFACT_PATH)
  const review = await getAuditResult('review', REVIEW_ARTIFACT_PATH)

  let message = '## Lighthouse results\n\n'

  const perfProd = Math.floor(prod.categories.performance.score * 100)
  const perfReview = Math.floor(review.categories.performance.score * 100)

  if (perfReview < perfProd) {
    if (perfProd - perfReview > 14) {
      message =
        message +
        `Major performance regression: ${perfReview} is *much* lower than the current score in production (**${perfProd}**).\n\n`
    } else {
      message =
        message +
        `Possible performance regression: ${perfReview} is lower than the current score in production (**${perfProd}**).\n\n`
    }
  }

  message =
    message +
    `Updated [Lighthouse report](${commenter.getArtifactURL(
      `/${REVIEW_ARTIFACT_PATH}`,
    )}) for the changes in this PR ([compare master](${commenter.getArtifactURL(
      `/${PROD_ARTIFACT_PATH}`,
    )}))\n\n`
  message = message + `| Category | Score |\n| --- | --- |\n`

  const prettyKeys = {
    performance: 'Performance',
    pwa: 'Progressive Web App',
    'best-practices': 'Best Practices',
    accessibility: 'Accessibility',
    seo: 'SEO',
  }
  Object.keys(review.categories).forEach(category => {
    message =
      message + `| ${prettyKeys[category]} | ${Math.floor(review.categories[category].score * 100)} |\n`
  })
  message =
    message +
    `\n*Tested with Lighthouse version: ${review.lighthouseVersion} - commit: ${commenter.env.sha1}*`

  await commenter.createOrUpdateComment('lighthouse', message)
}

;(async () => {
  await main().catch(err => {
    console.log(err)
    process.exit()
  })
  process.exit()
})()
