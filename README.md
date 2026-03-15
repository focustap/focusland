# Focusland - Minimal Friends-Only Game Starter

This is a **minimal starter** for a friends-only browser game, inspired by sites like Club Penguin or Neopets but intentionally much smaller.

It uses:

- **Frontend**: React + Vite (TypeScript), deployed as a static site (e.g. GitHub Pages)
- **Database + Auth**: Supabase (Postgres + Supabase Auth) called directly from the browser

The starter includes:

- Email/password **signup and login** with Supabase Auth
- **Lobby** page that shows username, avatar, and navigation
- **Profile** page to set username and pick an avatar
- Simple **placeholder game** page
- Backend **API route** that saves a game score to the database

---

## Project Structure

## Project Structure

- `src/`
  - `main.tsx` – React entrypoint, sets up React Router (using `HashRouter` for GitHub Pages).
  - `App.tsx` – Top-level routes and shared layout.
  - `index.css` – Simple, beginner-friendly styling.
  - `components/`
    - `AuthProvider.tsx` – Tracks Supabase auth session and shares it via context.
    - `ProtectedRoute.tsx` – Wrapper to protect pages that require login.
    - `NavBar.tsx` – Simple navigation bar for logged-in users.
  - `pages/`
    - `Login.tsx` – Signup/login form using Supabase Auth.
    - `Lobby.tsx` – Phaser-based town lobby (point-and-click room).
    - `Profile.tsx` – Lets users set username and choose an avatar.
    - `Game.tsx` – Phaser dodge minigame that saves scores to Supabase.
    - (optional) `Shop.tsx`, `Leaderboard.tsx` – placeholder pages you can create.
  - `lib/`
    - `supabase.ts` – Supabase client using environment variables.
    - `scores.ts` – Helper for saving scores directly to Supabase.
- `public/avatars/`
  - `avatar1.png`, `avatar2.png`, `avatar3.png` – Placeholder avatar images (replace with your own).
- `.env.example` – Example environment variables.

---

## Database Schema (Supabase / Postgres)

You can create these tables in the **Supabase SQL Editor**.

```sql
-- Profiles table: one row per user.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Scores table: stores game scores for users.
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  game_name text not null,
  score integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
```

You can keep row-level security (RLS) **enabled** and add simple policies, for example:

```sql
-- Allow users to read and upsert their own profile.
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can upsert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Allow users to insert their own scores and read them.
alter table public.scores enable row level security;

create policy "Users can insert their own scores"
  on public.scores for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own scores"
  on public.scores for select
  using (auth.uid() = user_id);
```

> Note: The backend functions use the **service role key** with explicit checks to make sure the Supabase access token is valid before reading/writing.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values.

### Frontend (Vite) – exposed to the browser

These are safe to expose; they use the **anon public key**.

- `VITE_SUPABASE_URL` – Your Supabase project URL.
- `VITE_SUPABASE_ANON_KEY` – Your anonymous public API key.

> For this GitHub Pages + Supabase-only version, you **do not** need any service role keys in the frontend.

---

## Running Locally

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create `.env`**

   ```bash
   cp .env.example .env
   # Then edit .env and fill in your Supabase values
   ```

3. **Start the dev server**

   ```bash
   npm run dev
   ```

4. Open the URL printed in the terminal (usually `http://localhost:5173`).

You should see the login page. After signing up and logging in, you’ll be redirected to the lobby.

---

## How Authentication Works

- The frontend uses the official **`@supabase/supabase-js`** client from `src/lib/supabase.ts`.
- `AuthProvider` wraps the app and listens for auth state changes.
- `ProtectedRoute` ensures that Lobby, Profile, and Game pages are only visible when the user is logged in.
- The Login page supports both **signup** and **login** with email + password.

---

## Deploying to GitHub Pages (Vite + React)

You can deploy the built `dist/` folder to GitHub Pages in several ways. A simple approach:

1. **Set up your repo**

   - Create a GitHub repository and push this project to it.

2. **Build the site**

   ```bash
   npm run build
   ```

   This creates a `dist/` folder with static assets.

3. **Enable GitHub Pages**

   - In your GitHub repo, go to **Settings → Pages**.
   - Choose **Deploy from a branch**.
   - Point it at a branch that contains the built `dist` contents (for example, a `gh-pages` branch).

   You can use a small deploy script or a GitHub Action to push `dist/` to `gh-pages`.

4. **Routing notes**

   - The app uses `HashRouter`, so routes look like `https://yourname.github.io/your-repo/#/lobby`.
   - This avoids 404 issues on GitHub Pages because everything is served from a single `index.html`.

5. **Environment variables on GitHub Pages**

   - Since GitHub Pages is static hosting, you need to bake your Supabase values into the build.
   - In your GitHub Action (or local build), set:

     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`

   - These are safe to expose for browser use, as long as your Supabase Row Level Security (RLS) policies are configured correctly.

