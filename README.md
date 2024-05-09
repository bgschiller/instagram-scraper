# instagram-scraper

Use playwright to login to Instagram and download a specific user's posts. I suspect this used to be possible with the API, but it seems like you have to pay for that now.

I'm using this to post a link to every instagram post from a couple of user accounts to a slack channel.

## Usage

1. Create a data directory in the root of the project. Add a file, `accounts.json` with the following format:

```json
[
  {
    "usernameToScrape": "username1",
    "webhookUrl": "https://hooks.slack.com/services/..." // webhook to send posts from this account
  },
  {
    "usernameToScrape": "username2",
    "webhookUrl": "https://hooks.slack.com/services/..."
  }
]
```

2. Create a file for each username you want to scrape in the data directory. The file should be named `username.json` and have the following format:

```json
{
  "lastSeenPostId": "c3uV-Xev9_dZsQaBcvw1iWQ5SVJU0I8Ao1b8ps0"
}
```

This specifies the post just before the one you want to start scraping from.

3. Add environment variables for the Instagram username and password. I use [direnv](https://direnv.net/) for this.

```bash
export INSTAGRAM_USERNAME=your-username
export INSTAGRAM_PASSWORD=your-password-here
```

4. Then run the following commands:

```bash
pnpm install
pnpm start
```
