# One Last Diwali

A static Diwali party invite with a shared Polaroid wall. The page is hosted as static files; Supabase provides anonymous visitor sessions and shared photo storage.

## What the photo wall does

- Visitors click **Count me in** and choose a photo; each Polaroid is that visitor's RSVP on the shared guest wall.
- The browser resizes and converts photos to WebP where supported, with a JPEG fallback for Safari and iOS. Images are limited to 1600 pixels on the long edge and 4 MB after compression.
- Every visitor can see all uploaded Polaroids. The wall refreshes for new uploads about every 25 seconds.
- The photos are scattered randomly each time the page is opened. Dragging or using arrow keys rearranges them for that visitor only; positions are not shared or saved.
- The center RSVP text is kept clear. Photos are placed in open space, and a drop or keyboard move that would cover text is kept or snapped to the nearest clear spot.
- One photo is allowed per anonymous browser identity. Clearing browser data or using another browser creates a new anonymous identity.
- Photos are public. Anyone with a photo URL can view that image. The page warns people before upload and stores no names or captions.
- Visitors cannot replace or delete photos. The project owner can remove an image from the Supabase Storage dashboard.

## 1. Create the Supabase backend

1. Create a free Supabase project.
2. In **Authentication → Sign In / Providers**, enable **Anonymous sign-ins**. See [Supabase anonymous sign-in docs](https://supabase.com/docs/guides/auth/auth-anonymous).
3. Open the **SQL Editor**, paste in `supabase/setup.sql`, and run it. This creates the public `diwali-photos` bucket and the storage policies.
   If this project was already set up, run the updated SQL again to allow the JPEG upload fallback used by Safari and iOS.
4. In **Project Settings → API**, copy the project URL and the **publishable key** (or the legacy `anon` key).
5. Put those values in `config.js`:

   ```js
   window.DIWALI_CONFIG = {
     supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
     supabasePublishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY"
   };
   ```

The publishable/anon key is meant to be visible in browser code; the SQL policies restrict what it can do. **Never put a `service_role` or secret key in this folder.** See [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Anonymous sign-in creates an account without asking for personal details and keeps it in that browser. Supabase recommends CAPTCHA protection for anonymous sign-in if a site will attract open public traffic. This small party-site setup does not include a CAPTCHA widget, so share the link with your group and add CAPTCHA protection before promoting it publicly.

## 2. Publish with GitHub Pages

1. Create a new GitHub repository. On GitHub Free, the repository must be public for GitHub Pages. See [GitHub's Pages guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
2. Upload the contents of this folder to the repository root: `index.html`, `app.js`, `config.js`, `.nojekyll`, `assets/`, and `supabase/`.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
5. GitHub will show the site URL in the Pages settings. Send that URL to your friends.

The same folder works on other static hosts, including [Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/): connect the GitHub repository, use `exit 0` as the build command, and `.` as the build output directory.

## Preview locally

After configuring Supabase, open PowerShell in this folder and run:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000`. Use a local web server rather than opening `index.html` as a `file://` URL because the app loads JavaScript modules.

## Free tier notes

Supabase Free currently includes 1 GB of file storage and pauses free projects after one week of inactivity. If the wall stops connecting after it has been idle, open the project in Supabase and resume it. Quotas and plan details can change; see [Supabase pricing](https://supabase.com/pricing) before relying on the service for a large audience.

## Files

```text
diwali-party-site/
├── index.html
├── app.js
├── config.js
├── .nojekyll
├── assets/
│   ├── first-screen-sunburst.png
│   └── diwali-tiger-poster.png
└── supabase/
    └── setup.sql
```
