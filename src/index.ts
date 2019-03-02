import ghGot from 'gh-got'

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

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

  private getExistingComment(comments: Comment[]): Comment {
    const existingComments = comments.filter(comment => comment.user.login === this.env.tokenUserName)

    if (existingComments.length > 0) {
      return existingComments[0]
    }

    return null
  }

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

  private getDataForKey(key: string, body: string): string {
    const match = new RegExp(`<!-- start:${key} -->(.*)<!-- end:${key} -->`, 'gms')
    const re = match.exec(body)

    if (re && re.length >= 2) {
      return re[1].trim()
    }

    return null
  }

  public getArtifactURL(path: string): string {
    return `${this.env.buildURL}/artifacts/0${this.env.home}${path}`
  }

  public async createOrUpdateComment(key: string, message: string) {
    const comments = await this.getComments()
    const existingComment = this.getExistingComment(comments)

    const originalMessage = `<!-- start:${key} -->${message}<!-- end:${key} -->`
    let comment = originalMessage
    if (existingComment) {
      comment = existingComment.body
      const data = this.getDataForKey(key, existingComment.body)
      if (data) {
        comment = comment.replace(data, message)
      } else {
        comment = `${comment}\n\n${originalMessage}`
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
