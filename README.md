# Barber Doza — New York Beauty Industry Data

A static, GitHub Pages-ready dashboard showing active licensed **barbershops** and **appearance enhancement businesses** in New York State. It includes statewide and city totals, rankings, a clustered map, and a searchable city table.

The interface uses the Barber Doza palette and supplied logo assets:

- Charcoal `#303636`
- Beige `#bbad9d`
- Green `#495a58`
- Cloud `#e5e3dc`
- Mauve `#824c48`
- Clay `#767267`
- White `#ffffff`

## Repository structure

```text
index.html
assets/
  barber-doza-logo-black.png
  barber-doza-logo-white.png
  barber-doza-mark-black.png
  barber-doza-mark-white.png
css/style.css
js/app.js
data/ny_shops.json
scripts/fetch_data.py
.github/workflows/update-data.yml
```

## Publish with GitHub Pages

1. Create a new GitHub repository, or open the repository Claude originally created.
2. Upload the **contents** of this folder to the repository root. Keep the folder structure exactly as shown above.
3. Commit the files to the `main` branch.
4. Open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select branch **main** and folder **/ (root)**, then click **Save**.
7. GitHub will publish the site at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

## Replace the sample data with the live New York registry

The included `data/ny_shops.json` is marked as sample data. To generate the live dataset:

1. In GitHub, open the **Actions** tab.
2. Select **Update NY shop data**.
3. Click **Run workflow**, then confirm **Run workflow**.
4. The workflow runs `scripts/fetch_data.py`, rewrites `data/ny_shops.json`, and commits the updated file.
5. GitHub Pages will redeploy automatically after the commit.

The workflow also runs every Monday. No API key is normally required. If New York's Socrata API rate-limits the job, create a Socrata app token and save it in **Settings → Secrets and variables → Actions** as `NY_APP_TOKEN`.

## Preview locally

Opening `index.html` directly will not load the JSON in many browsers. Run a local web server from the repository folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Main customization points

- Brand colors and layout: `css/style.css`
- Headlines and explanatory copy: `index.html`
- Search, charts, table, and map behavior: `js/app.js`
- New York data processing: `scripts/fetch_data.py`
- Refresh schedule: `.github/workflows/update-data.yml`

## Data source and counting method

Data comes from the New York State Department of State open-data registry. The fetch script counts business-level license categories `DOSAEBUSINESS` and `DOSBARSHOPOWNER`. Area Renters are excluded because they may share an already-counted shop address.
