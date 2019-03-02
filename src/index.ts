import ghGot from 'gh-got'

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

/**
 * A GitHub user
 * https://developer.github.com/v3/issues/comments/#response
 *
 * @interface User
 */
interface User {
  login: string
  id: number
  node_id: string
  avatar_url: string
  gravatar_id: string
  url: string
  html_url: string
  followers_url: string
  following_url: string
  gists_url: string
  starred_url: string
  subscriptions_url: string
  organizations_url: string
  repos_url: string
  events_url: string
  received_events_url: string
  type: string
  site_admin: boolean
}

/**
 * A GitHub comment
 * https://developer.github.com/v3/issues/comments/#response
 *
 * @interface Comment
 */
interface Comment {
  id: number
  node_id: string
  url: string
  html_url: string
  body: string
  user: User
  created_at: Date
  updated_at: Date
}

/**
 * The required environment variables
 *
 * @interface Environment
 */
interface Environment {
  userName: string
  repo: string
  branch: string
  buildURL: string
  pr: number
  token: string
  tokenUserName: string
  sha1: string
  home: string
}

interface Request {
  body: Comment[]
}

const REQUIRED_ENVIRONMENT_VARS: (keyof Environment)[] = [
  'userName',
  'repo',
  'branch',
  'buildURL',
  'pr',
  'token',
  'tokenUserName',
  'sha1',
  'home',
]

/**
 * Class that helps you with creating or updating GitHub comments on pull requests
 *
 * @class Commenter
 */
class Commenter {
  public env: Environment
  public constructor() {
    this.env = {
      userName: process.env.CIRCLE_PROJECT_USERNAME,
      repo: process.env.CIRCLE_PROJECT_REPONAME,
      branch: process.env.CIRCLE_BRANCH,
      buildURL: process.env.CIRCLE_BUILD_URL,
      pr: parseInt(process.env.CIRCLE_PULL_REQUEST) || undefined,
      token: process.env.GITHUB_TOKEN,
      tokenUserName: process.env.GITHUB_TOKEN_USERNAME,
      sha1: process.env.CIRCLE_SHA1,
      home: process.env.HOME,
    }

    const missing = REQUIRED_ENVIRONMENT_VARS.filter(key => {
      return !this.env[key]
    })
    if (missing.length > 0) {
      throw new Error('Missing environment variables:\n' + missing.join(', '))
    }
  }

  /**
   * Checks if the user set in `GITHUB_TOKEN_USERNAME` already has a comment on this pull request.
   *
   * @private
   * @param {Comment[]} comments
   * @returns {Comment} The first comment by `GITHUB_TOKEN_USERNAME` if exists
   * @memberof Commenter
   */
  private getExistingComment(comments: Comment[]): Comment {
    const existingComments = comments.filter(comment => comment.user.login === this.env.tokenUserName)

    if (existingComments.length > 0) {
      return existingComments[0]
    }

    return null
  }

  /**
   * Gets all the GitHub comments for the given pull request
   *
   * @private
   * @returns {Promise<Comment[]>}
   * @memberof Commenter
   */
  private async getComments(): Promise<Comment[]> {
    try {
      const { body }: Request = await ghGot(
        `repos/${this.env.userName}/${this.env.repo}/issues/${this.env.pr}/comments`,
        {
          token: process.env.GITHUB_TOKEN,
        },
      )

      return body
    } catch (error) {
      throw error
    }
  }

  /**
   * Searches for the given key in the comment body
   *
   * @private
   * @param {string} key The key we look for when updating comments, matches `<!-- start:${key} -->(.*)<!-- end:${key} -->`
   * @param {string} body The comment body to search in
   * @returns {string} The matched body or null
   * @memberof Commenter
   */
  private getDataForKey(key: string, body: string): string {
    const match = new RegExp(`<!-- start:${key} -->(.*)<!-- end:${key} -->`, 'gms')
    const re = match.exec(body)

    if (re && re.length >= 2) {
      return re[1].trim()
    }

    return null
  }

  /**
   * Gets the artifact URL for the given path, useful for e.g. linking to a coverage report or lighthouse results
   *
   * @param {string} path The path to the stored artifact, should be set in the circleci config with `store_artifacts` key
   * @returns {string} The artifact url
   * @memberof Commenter
   */
  public getArtifactURL(path: string): string {
    return `${this.env.buildURL}/artifacts/0${this.env.home}${path}`
  }

  /**
   * Creates or updates a comment on the pull request referenced through the environment variable `CIRCLE_PULL_REQUEST`
   * If the username set in `GITHUB_TOKEN_USERNAME` already has an existing comment on this pull request
   *  this method will instead update the existing comment with a new body.
   *
   * If it matches the pattern `<!-- start:${key} -->(.*)<!-- end:${key} -->` in the body, it will replace the content with `message`.
   * If it does not match the pattern, it will append the `message` to the body.
   *
   * @param {string} key The key we look for when updating comments, matches `<!-- start:${key} -->(.*)<!-- end:${key} -->`
   * @param {string} message The message body, GitHub markdown or HTML.
   * @memberof Commenter
   */
  public async createOrUpdateComment(key: string, message: string) {
    const comments = await this.getComments()
    const existingComment = this.getExistingComment(comments)

    const formattedMessage = `\n<!-- start:${key} -->\n${message}\n<!-- end:${key} -->\n`
    let comment = formattedMessage
    if (existingComment) {
      comment = existingComment.body
      const data = this.getDataForKey(key, existingComment.body)
      if (data) {
        comment = comment.replace(data, message)
      } else {
        comment = `${comment}\n\n${formattedMessage}`
      }
    }

    try {
      const url = existingComment
        ? `repos/${this.env.userName}/${this.env.repo}/issues/comments/${existingComment.id}`
        : `repos/${this.env.userName}/${this.env.repo}/issues/${this.env.pr}/comments`
      await ghGot(url, {
        token: process.env.GITHUB_TOKEN,
        body: {
          body: comment,
        },
        method: existingComment ? 'PATCH' : 'POST',
      })
    } catch (error) {
      throw error
    }
  }
}

export = Commenter
