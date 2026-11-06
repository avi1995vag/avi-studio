# AvI Studio

AvI Studio is an editorial workspace for 4:5 carousels and single posters. GitHub Pages hosts the browser studio. GitHub Actions refreshes the news desk and runs the unattended Instagram publisher. The original Flask server, Cloud Run deployment, Cloud Scheduler and GCS dependencies have been removed.

## Studio

- Start with an offline sample, a blank design, a Gemini prompt or a news headline. The browser supports English, Kannada and bilingual output in the modes that offer it.
- Select a frame to edit its text, layout, colors, size or image. Move, duplicate or remove frames in the inspector. Upload an image directly, or provide an image URL whose server allows cross-origin browser access. An optional Pexels key enables stock search.
- The browser autosaves the current carousel and poster separately on this device. Export a JSON draft to move it to another browser or keep a backup. Import the `draft.json` from an Actions run to edit that run's content and palette. Download a JPEG poster or a ZIP with carousel JPEGs and the caption.
- The layout gallery previews Signal Wire, Cutout Cover, Quote Prism, and Field Notes. Poster photo controls adjust zoom and crop. Poster downloads support JPEG or PNG in portrait, square fit, and story fit.
- The News Desk uses a snapshot rebuilt by GitHub Actions every four hours and shows its update time. Source feeds can be edited in `assets/sources.json`. Poster links use a matching feed excerpt or Gemini URL Context. When the article is unavailable, paste a source excerpt or start a headline-only draft and check it against the original before publishing.
- Browser keys are used for the current tab. Manual Meta and Zernio publishing use the credentials entered in Integrations and a Cloudinary unsigned upload preset. Keep the Cloudinary API secret in GitHub Actions secrets. The unattended workflow publishes to Instagram through Meta.

## GitHub setup

1. Push this folder to your GitHub repository's default branch, including the hidden `.github` folder.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions**. Open **Actions → Studio Pages** and run it from the default branch. The deployment links to your studio URL.
3. In **Actions → AvI Autopilot**, choose **Run workflow → sample**. Download the artifact and review its five sample slides, caption and editable draft. Sample mode works without credentials.
4. Add `GEMINI_API_KEY` under **Settings → Secrets and variables → Actions → Secrets**. Run **draft** for an edition using a real news feed. If the selected feed has no eligible story, the run summary explains the skip.
5. For live Instagram publishing, add the other secrets in the table and set the repository variable `PUBLISH_ENABLED` to `true`. Choose **publish** for a manual Actions run, or set `AUTOPILOT_SCHEDULE` to `publish` to enable unattended posts. If the GCP Scheduler is still active, turn it off before enabling live Actions publishing.

| Actions secret | Used for |
| --- | --- |
| `GEMINI_API_KEY` | Generating carousels from feeds |
| `META_ACCESS_TOKEN` | Meta Graph publishing with Facebook Login |
| `INSTAGRAM_BUSINESS_ID` | Professional Instagram account linked to the Facebook Page |
| `CLOUDINARY_CLOUD_NAME` | Hosting JPEGs for Meta to fetch |
| `CLOUDINARY_API_KEY` | Authenticated server-side uploads |
| `CLOUDINARY_API_SECRET` | Authenticated server-side uploads |

The Meta account and token need content publishing access for the connected professional account. Cloudinary delivers public HTTPS image URLs to Meta. The Actions pipeline uses authenticated uploads and has no Cloudinary unsigned-preset requirement.

| Actions variable | Values |
| --- | --- |
| `AUTOPILOT_SCHEDULE` | Empty or `off` skips scheduled runs. `draft` saves artifacts. `publish` schedules Instagram posts when publishing is enabled. |
| `PUBLISH_ENABLED` | `true` enables manual and scheduled live publishing from the default branch. |
| `GEMINI_MODEL` | Optional model override for Actions. Defaults to `gemini-3.5-flash`. |
| `META_API_VERSION` | Optional Graph API version override for Actions. Defaults to `v24.0`. |

### Schedule and history

The included schedule runs at **08:17 IST** for India, **13:23 IST** for Kannada Karnataka and **19:37 IST** for world news. Edit both the cron entries and their category mappings in `.github/workflows/autopilot.yml` to change the schedule. GitHub may delay scheduled runs. The personal planner in the studio stores ideas locally and opens drafts for review.

Actions keep an audit ledger in the `autopilot-history` branch. The workflow creates the branch on the first live run and needs permission to update it. Live runs require a fresh story with enough source text. The workflow reserves a story and run before submitting the final publish request. If the request times out or the final history write fails, verify the Instagram container and account before editing the pending ledger entry. A pending entry intentionally blocks automatic retries. Review build logs, status and 14-day draft artifacts in Actions.

GitHub documents the [Pages deployment source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [workflow schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule). See the [Meta Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [Cloudinary upload reference](https://cloudinary.com/documentation/image_upload_api_reference) and [Gemini structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Local preview

Requires Python 3.12 or newer. Local Kannada rendering also needs Noto Sans Kannada or Windows Tunga and a Pillow build with libraqm. The GitHub runner installs the Linux fonts.

```sh
python -m pip install -r requirements.txt
python build_site.py --offline
python -m http.server 8000 --directory _site
```

Open the local studio at `http://localhost:8000`. Omit `--offline` to refresh public feeds. Create a headless sample or run the verification suite with these commands.

```sh
python main.py --sample --theme paper --slides 5
python -m unittest discover -s tests
node --check assets/studio.js
node --check assets/workspace.js
```
