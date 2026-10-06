# VerseLight

A desktop app for projecting Bible verses and song lyrics in church services. Built with Tauri 2 and React, it runs on Windows and macOS and works fully offline.

## The interface

VerseLight opens on **Home**. The sidebar on the left has **Home**, **Bible** (with **Bible Study** under it), **Songs** and **Backgrounds**, and at the bottom the **Projector** status, **Settings** and **Help**. The selected screen fills the rest of the window. While something is being presented, the **Presentation** panel appears on the right and the sidebar shrinks to icons (their names show as tooltips) to leave room. Windows narrower than 1100 px always use the icon sidebar.

**Home**
- Quick actions: **Find a Bible verse** and **Find a song** open that screen with the search box ready; **Change the background** opens Backgrounds; **Add or manage Bibles and songs** opens Settings → Bibles.
- Recently used songs and the verses saved in Bible Study; click one to open it.
- While something is being presented, a *Now presenting* card shows the current slide and the projector status.
- With no Bible imported yet, a prompt to import one.

**Bible**
- Choose a translation at the top of the book list. **Manage Bibles…** at the bottom of that menu opens **Settings → Bibles**, where Bible files are imported and removed.
- Pick a book from the Old or New Testament list, then a chapter from the strip under the book name (the arrows step to the previous or next chapter).
- Click a verse to select it. Shift-click another verse to select the passage between them.
- Search by **Reference** (`John 3:16-18`, `john 3 16`, `jn 3:16`, `1 cor 13`, `Ps 23`, `Jude 3`) or by **Keyword** (every word must appear). Single-chapter books such as Jude and Philemon take a verse number directly. Clicking a result opens its chapter with the verse selected.
- Choose **▶ Present Now** (or press **Enter**). Every verse becomes its own slide.

**Songs**
- Search the song library by title, English or transliterated title, artist or lyrics (section tags such as `[Chorus]` aren't searched). Press **Enter** to open the first match. The list shows how many songs there are, or how many match.
- **New song** writes a song; **Import** adds song files (the same import as Settings → Songs). With an empty library, the Songs screen explains both.
- Enter the title, artist, copyright and CCLI number.
- Write lyrics with section tags on their own line: `[Verse 1]`, `[Chorus]`, `[Bridge]`. The + buttons insert the next tag for you.
  - A blank line starts a new slide. In Auto mode, long sections are split into slides of four lines or fewer; you can also fix 1–4 lines per slide.
  - A tag with nothing under it repeats that section, so a chorus is written once.
- Slides are created automatically. Drag sections (or use the arrows) to reorder them, click a slide to leave it out (it shows *Left out*, and leaving out a chorus slide leaves it out every time it is sung), and add sections to the order again. The slide count shows how many will be presented, e.g. *5 of 7*. The last section can't be removed from the order.
- Notes point out anything that would keep words off the screen: a section left out of a custom order, or a section name written out twice (only the first one's words are used). A note also says when another song has the same title and writer.
- **▶ Present Now** shows the song on the projector; the ▶ on a slide starts from that slide. While the song is presented, the slide on the projector is outlined and marked *Now*. Edits made while presenting update the screen straight away, and moving sections keeps the projector on the same words.
- A background chosen for one slide stays with that slide when sections are moved. Deleting a song also removes the backgrounds chosen for it.

**Presentation** (the laptop's control screen; the projector shows only the slide)
- The projector status: *Projector off*, *Connecting to projector…* or *Live on <display name>*.
- The current slide, marked *On screen now*, *Black screen* or *Preview only* (projector off), with your place: *Slide 3 of 12*.
- Large **Previous**, **Next** and **Black** buttons. While the screen is black the button reads **Show**. Previous and Next are greyed out at the first and last slide, unless a Bible passage can run on into another chapter.
- A preview of the next slide. At the end of a chapter it names the next chapter (for example *John 4 (next chapter)*); at the end it says *End of song* or *End of passage*.
- **Start presenting** (while the projector is off) or **Stop presentation**, and **Close** beside it. Stop turns the projector screen off and keeps your place; Close clears the presentation and hides the panel.
- The slide list: click any slide to show it at once. Each slide shows its number; the current slide is outlined in red and marked *Now*; verses you originally selected are outlined. The image button on a slide sets that slide's background; the menu opens inside the window, and **Esc** closes just the menu.
- Choose the projector display in **Settings → Projector**.

**Backgrounds** sets the default font, text size, colours and background (the Default look) and your other looks. See [Presentation backgrounds](#presentation-backgrounds-looks).

**Projector** (bottom of the sidebar) shows *Off*, *Connecting…* or *Live on <display name>*. Click it to open Settings → Projector.

**Settings**
- **Projector:** the projector status, and which screen shows the slides (*Second screen (automatic)* uses the first screen that isn't the main one).
- **Bibles:** import or remove Bibles, and import or replace cross references. Removing a Bible asks first.
- **Songs:** how many songs you have, and **Import songs** from files.
- **Backup:** **Back up library** saves one file with your songs, looks, saved verses and settings (not the Bible texts). **Restore from backup** checks the file and asks before replacing your library.
- **Keyboard:** the presentation keys. **About:** version and credits.

**Help** explains how to present in four steps, how to present a verse or a song, Previous and Next, the black screen, stopping and closing, and the keys, with links to the right place in Settings.

**Settings** holds the projector display, Bible and cross-reference files, song import, backup and restore, the keyboard shortcuts and credits.

## Requirements

- Node.js 18 or later
- Rust 1.85 or later (install from https://rustup.rs)
- **Windows**: Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 10/11)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)

See https://tauri.app/start/prerequisites/ for details.

## Run and build

```bash
npm install
npm run tauri dev      # run the app in development
npm run tauri build    # build an installer for the current OS
```

Installers are written to `src-tauri/target/release/bundle/`. Windows produces `.msi` and `.exe` (NSIS); macOS produces `.app` and `.dmg`. Each OS must be built on that OS. To build both from one place, use a CI service such as GitHub Actions with `tauri-apps/tauri-action`.

The builds are unsigned, so Windows SmartScreen and macOS Gatekeeper will warn on first launch. On macOS, right-click the app and choose **Open**. For wider distribution, set up code signing: https://tauri.app/distribute/

`npm run dev` also runs the UI in a normal browser for quick design work. There, the projector opens as a popup and data is stored in localStorage.

## Tests

```bash
npm test
```

Runs the automated tests with Vitest: the presentation session (verse-by-verse slides, Previous/Next, chapter run-on, black screen, song order), the presentation keys, the presentation panel's controls and background menu, song lyrics, slides, search and import (including Malayalam), the Songs screen, and presenting a song from the Songs screen through to what the projector is sent.

## Bible text

VerseLight contains **no Bible text**. It displays verses exactly as they appear in a Bible file you import, and never rewrites or generates scripture.

**Public-domain KJV.** This command downloads the King James Version from an existing open dataset (github.com/thiagobodruk/bible) and saves it, unchanged, as `bibles/kjv.verselight.json`:

```bash
npm run fetch-kjv
```

Then import that file in the app under **Bibles → Import Bible file**. That dataset contains 31,100 verses; VerseLight imports exactly what the source provides. In the UK the KJV is under Crown patent, so check local rules there.

**NIV and other copyrighted translations.** Biblica licenses the NIV for online display only. Storing the full text offline needs written permission from Biblica, and quoting without permission is limited to 500 verses. Until you have a license, use **Enter verses manually** to paste individual passages from a licensed source, within Biblica's quotation limits, with the copyright notice filled in.

**Supported import formats** (JSON):

1. VerseLight format:
   `{ "format": "verselight-bible", "name", "abbreviation", "license", "books": [{ "name", "chapters": [["verse 1", "verse 2"]] }] }`
2. An array of books: `[{ "name"?, "chapters": [["verse 1", ...]] }]`. Missing names use the standard 66-book order.
3. `{ "books": [{ "name", "chapters": [{ "verses": [{ "verse", "text" }] }] }] }`

## Malayalam Bible and the parallel (bilingual) view

### Getting the Malayalam Bible

```bash
npm run fetch-malayalam-bible
```

This downloads the **Malayalam Bible 1910 (Sathyavedapusthakam), revised in contemporary orthography** (`mal2015`) from eBible.org. It saves the Bible as `bibles/mal1910.verselight.json`. Import that file under **Settings → Bibles → Import a Bible**.

- **License (verified):** © 2015 The Free Bible Foundation, based on the public-domain 1910 edition, released under **Creative Commons Attribution-ShareAlike 4.0**. See https://ebible.org/mal2015/copyright.htm.
  - You may share and redistribute it with attribution.
  - Changes must be indicated.
  - Redistributed copies keep the same license.
- **Attribution in VerseLight:** the attribution travels with every passage and appears under the reading view. VerseLight does not change the words; the script only removes USFM markup (footnotes, cross-references, headings).
- **If the download is blocked:** download the USFM zip for `mal2015` from eBible.org and run `npm run fetch-malayalam-bible -- --file path/to/mal2015_usfm.zip`.

### Reading side by side

In **Bible**, choose **English**, **മലയാളം** or **EN + മല**:

- **Rows by verse number:** in the bilingual view each verse number is one row, with the English text on the left and the Malayalam text on the right.
- **Books and titles:** the book list and chapter title show both names.
- **Selecting:** click a row, or shift-click to select a passage.
- **Reference search:** accepts English or Malayalam book names (for example `John 3:16` or `യോഹന്നാൻ 3:16`).
- **Keyword search:** searches both translations and shows each result in both languages.
- **Presenting:** **Show on screen** chooses what the projector shows: both translations, English only or Malayalam only. Then choose **▶ Present Now**.
- **Projector layout:** the Backgrounds screen sets it: **Stacked** (English above Malayalam) or **Side by side**. The footer credits both translations, for example "John 3:16 (KJV · MAL1910)".

### Verse numbering

Verses are paired by book, chapter and verse number. A verse that one translation doesn't have is marked "not in this translation" rather than shifting the rest.

The download script compares every chapter with your KJV file and lists any chapters whose verse counts differ. Against the KJV file from `npm run fetch-kjv`, 22 of 1,189 chapters differ, for two reasons:

- **Genuine translation differences.** The 1910 Malayalam Bible follows the Revised Version, which omits a few KJV verses such as Acts 15:34, Acts 28:29 and Romans 16:24, and a few chapter boundaries fall differently.
- **Defects in the KJV dataset itself.** The KJV JSON from github.com/thiagobodruk/bible is missing a verse in some chapters, for example Matthew 2 (22 verses instead of 23), so later verses in those chapters are numbered one lower than in a printed KJV. This affects the English-only view too. A KJV source with standard numbering, such as eBible's `eng-kjv` USFM, would fix it.

## Cross references

Select a verse or passage in **Bible** and choose **Cross references** in the bar at the bottom. A panel lists related passages, most relevant first, with a preview of each from your own Bible (both languages in the bilingual view). For each one you can:

- click it, or **Open**, to go to that passage (the panel then shows *its* cross references, so you can follow a chain)
- **▶ Present** it on the projector straight away

For a passage, the references of every verse are combined. References with negative votes on OpenBible.info are hidden behind **Show … less relevant**.

### Getting the data (works offline once imported)

```bash
npm run fetch-crossrefs
```

This downloads OpenBible.info's `cross-references.zip` and saves `bibles/cross_references.txt` unchanged. Then import it: open the Cross references panel and choose **Import cross references**, or use **Settings → Bibles**. If the download is blocked, download the zip from https://www.openbible.info/labs/cross-references/ and run `npm run fetch-crossrefs -- --file path/to/cross-references.zip`.

- **License (verified):** Creative Commons Attribution 4.0 (CC BY 4.0), stated on the dataset page and in the file's header line. The data draws mainly on the public-domain *Treasury of Scripture Knowledge*.
- **What VerseLight does to meet CC BY 4.0:**
  - It credits OpenBible.info and links the source and license in the panel.
  - It notes its only change: the data is converted to VerseLight's storage format, with every reference and vote kept and results listed by votes.
- **What the file contains:** about 345,000 references with vote counts, and no Scripture text. The ESV notice on OpenBible's website covers the quotations shown on its pages, which VerseLight does not use. Verse text comes from your own imported Bibles.
- **Verse numbering:** references use standard English (KJV-style) numbering, so the KJV dataset defects described above also affect a few cross references in those chapters.

## Chapter Overview

On the Bible screen, switch a chapter from **Read** to **Overview** (top right of the chapter title) for a study overview of that chapter. It uses only data stored in VerseLight. There are no AI summaries, it works offline, and it never presents or creates slides.

- **Chapter name and number,** with its position in the book ("Chapter 3 of 21"), verse count and number of sections. In the bilingual view, both book names are shown.
- **Main sections:** the section headings of the Berean Standard Bible with their verse ranges (for example "vv. 1–21 Jesus and Nicodemus"), sub-headings, and parallel passages. Click a section to read from its first verse.
- **Key verses:** the chapter's most cross-referenced verses, ranked by OpenBible.info cross-reference votes. Click one to go to it in the reading view with the verse selected. This needs the cross references imported (see above).
- **Previous and next chapter:** these stay in the overview and cross into the next or previous book (John 21 → Acts 1).
- **Nearby chapters** (two either side) and **related chapters** (the chapters most connected to this one by cross references).
- **Read Chapter** returns to the verse-by-verse reading view.

The Read view stays the default, so opening a chapter during a service always shows the verses. While the overview is showing, the selection bar and Enter-to-present are turned off.

**Section headings data.** `src/data/sections.json` holds the BSB's 3,095 section headings with their verse positions and parallel references, and no BSB verse text. It is bundled with the app and loaded only when an overview is first opened. The BSB was dedicated to the public domain on 30 April 2023 (https://berean.bible/terms.htm); headings are kept word for word. To rebuild the file, run `npm run fetch-sections`, or `npm run fetch-sections -- --dir path/to/bsb-usfm`. The source is https://github.com/usfm-bible/examples.bsb. Headings are in English, including in the Malayalam view, and follow standard English verse numbering.

## Word Study

**Bible Study** (under Bible in the sidebar) finds every verse where a word appears. It is for Bible study only and never presents anything; to show a verse, open it in the Bible and choose Present Now there.

- **Search:** type a word (for example `grace` or `കൃപ`) and press Enter. Several words find verses that contain all of them.
- **Translation:** Word Study searches the translation selected on the Bible screen (the English one in the bilingual view). You can pick another in the **Translation** menu.
- **Match:**
  - **Exact word:** `grace` only, not `graces` or `disgrace`. The default for English.
  - **Starts with:** `grace`, `graces`. The default for Malayalam, where endings join the word (`കൃപ` also finds `കൃപയാൽ`).
  - **Anywhere:** also inside longer words.
- **Results:** the number of occurrences, verses and books, then the verses grouped by book in Bible order. The searched word is highlighted. The side list shows each book's count; click a book to jump to it. Searches with more than 300 verses start with the books collapsed.
- **For each verse:**
  - click it, or **Open in Bible**, to open it on the Bible screen with the verse selected
  - **Copy** the verse with its reference
  - **Save** it: saved verses are listed under **Saved** and stored in your library, by position, so they show in any translation
  - **Cross references**: the same OpenBible.info cross references as the Bible screen
- **Offline:** everything runs on this computer, using the Bible text and search index VerseLight already has.

Not included yet: Hebrew, Greek, Strong's numbers and dictionaries.

## Presenting

The workflow is: **select a Bible passage or a song → preview → ▶ Present Now.** Present Now shows it on the projector straight away, opening the projector on the chosen display if it isn't open yet. The laptop becomes the control screen, and the projector shows only the slide: no sidebar, buttons, menus, thumbnails, cursor or window border.

**Bible: verse by verse.** Present Now starts a presentation of the whole chapter, one verse per slide, beginning at the first verse you selected. Next and Previous always move exactly one verse. They go past the end of your selection, and from the last verse of a chapter Next continues into the next chapter (Previous from verse 1 goes into the previous chapter). So if only John 3:16 was selected, Next still shows John 3:17, 3:18 and so on.

**Songs: section by section.** Each section slide (Verse 1, Chorus, Verse 2, Chorus, …) is one slide, in the song's play order. Slides that were left out are skipped.

**Keyboard** (works wherever focus is, except while typing in a field; press Esc to leave a field first):

| Key | Action |
| --- | --- |
| Space, → (also ↓, Page Down, most clickers) | Next |
| ← (also ↑, Page Up) | Previous |
| B | Black screen on/off |
| Esc | Stop presentation (an open menu closes first) |

**Stopping and starting again.** **Stop presentation** (or Esc) closes the projector but keeps your place. **Start presenting** reopens it on the same slide. **Close**, next to Stop presentation, clears the presentation.

**How it stays in sync.** There is one presentation state: the slides and the current slide. The laptop preview, the slide list and the projector all read that same state, and the projector is sent exactly the slide the preview shows, with the same background and black-screen setting. The projector reports back when its window opens; that is when the status turns to *Live*.

## Presentation backgrounds (Looks)

A **look** is a saved presentation background plus text style. Open **Backgrounds** in the sidebar to create and edit them.

- **Background:** solid colour, gradient (with direction), a built-in gallery, or your own image. Uploaded images are resized to fit a 1920 × 1080 screen and stored inside VerseLight, so they work offline.
- **Adjust:** brightness, a dark overlay to keep text readable, and blur. Blur is scaled to the screen, so the preview matches the projector at any resolution. Only the background is filtered; text stays sharp.
- **Text:** font, font size, colour, shadow, alignment, and whether references and song credits show.
- **Presets:** **Save as new look** keeps the current settings as a preset. Three starter looks are included.
- **Where a look is used**, from most to least specific:
  1. one slide: the image button on a slide thumbnail in the presentation panel
  2. one song or passage: the image button in its header in the presentation panel
  3. all Bible slides or all song slides: **Use this look for** on the Backgrounds screen
  4. the Default look, edited on the **Backgrounds** screen

The projector, the live preview and every thumbnail work out each slide's look the same way, so the preview always shows exactly what the projector will show.

**Gallery artwork** is original and generated by VerseLight itself (`src/lib/gallery.ts`), so it carries no third-party image rights. For uploaded images, use photos you own or are licensed to project.

## Song library

VerseLight includes no song lyrics. To add a library of public-domain hymns, run:

```bash
npm run fetch-hymns
```

This downloads the catalog from [ChurchApps/WorshipCommonsContent](https://github.com/ChurchApps/WorshipCommonsContent) and saves `songs/worshipcommons-pd.json`. Then, in the app, open **Settings → Songs** and choose **Import songs**.

- **Which songs:** English songs the repository files under its public-domain license, limited to those dated 1930 or earlier or dedicated CC0 by their writer (512 at the time of writing). Public-domain entries dated after 1930 without a CC0 dedication are skipped and listed when the script runs, because they often add newer material to an older hymn.
- **What changes:** the words are kept exactly. Chord symbols such as `[F]` are removed, and section labels such as `Verse 1` become VerseLight tags such as `[Verse 1]`.
- **Duplicates:** importing again skips any song whose title and writer are already in your library (ignoring case, punctuation and how Malayalam was typed). Songs already there are never changed, and the import window lists the songs it will skip.
- **Legal note:** public-domain status was determined by WorshipCommons, mostly under US rules, and can differ in other countries. The repository asks for a courtesy credit to Hymnary.org for the texts.

## Malayalam songs

VerseLight supports Malayalam songs in Unicode alongside English ones.

- **Library:** filter the song list by **All / English / മലയാളം**, and switch between **All songs**, **Favorites** (tap the star on any song) and **Recent** (songs you presented or added to a presentation).
- **Titles:** each song has its title in its own script, plus an optional **English or transliterated title** (e.g. a Manglish spelling). The transliterated title is shown under the Malayalam title and can be searched.
- **Search:** matches the title, transliterated title, writer and lyrics. It ignores differences in how Malayalam was typed: old-style chillu (consonant + virama + ZWJ) and new atomic chillu letters match each other, and invisible joiners are ignored. Stored and projected text is never changed.
- **Language:** detected automatically from the text, and can be set with the **EN / മല** switch in the song editor.
- **Sections:** Verse, Chorus, Bridge, Pre-Chorus, Tag and Ending buttons insert tags; any other tag name, including Malayalam names, works too.
- **Slides:** every slide shows as a preview. Click a slide to leave it out, reorder sections, or use the ▶ on a slide to present from that slide.
- **Fonts:** Noto Sans Malayalam and Noto Serif Malayalam (SIL Open Font License) are bundled and used automatically for Malayalam text in every font, so lyrics render correctly offline, including conjuncts. Malayalam slides get extra line height.

### Getting Malayalam songs into VerseLight

VerseLight ships with **no Malayalam lyrics**. When this feature was added, no Malayalam Christian song collection could be found whose license allows redistribution, so none was bundled:

- **jesushealsfellowshipchurch/All-Christian-Songs** has no license.
- **VerseVIEW's song database** isn't published under an open license.
- **Lyric websites** publish lyrics for reading only.

Much of the popular repertoire is still under copyright (in India, copyright lasts for the author's life plus 60 years).

To add songs your church is licensed to use:

- **Type or paste** them: Songs → **New Malayalam song** (choose മലയാളം first).
- **Import files:** **Import** on the Songs screen (or **Settings → Songs → Import songs**), then pick one or more files:
  - **OpenLyrics** (`.xml`), the open format exported by OpenLP and other worship software. Section names, verse order, authors and copyright are read, and chord marks are removed. If a file holds each verse in both Malayalam and a transliteration, the Malayalam verses are kept and the transliterated title is used for search.
  - **VerseLight song files** (`.json`); entries may include `language: "ml"` and `altTitle`.

## Song lyrics

Only project lyrics your church is licensed to show, for example under a CCLI Church Copyright License. Enter the CCLI song number and copyright on each song; they display in the slide footer when **Show references and song credits** is on.

## Keyboard shortcuts

These work in both the control window (when you're not typing) and the projector window. Most presentation clickers send Page Up/Page Down, so they work too. The same list is in **Settings → Keyboard** and on the **Help** screen.

| Key | Action |
| --- | --- |
| → ↓ Space Page Down | Next slide |
| ← ↑ Page Up | Previous slide |
| B | Black screen on/off |
| Esc | Stop presenting (in a text box or an open menu, Esc closes that first) |
| Enter | Present the selected Bible verses (Bible screen) |

## Where data is stored

- Windows: `%APPDATA%\app.verselight.desktop\`
- macOS: `~/Library/Application Support/app.verselight.desktop/`

`library.json` holds songs, services, scripture passages and the look settings. Each imported Bible is stored as `bible-<id>.json`. Background images are embedded in the library, so large photos make it bigger; images under 2 MB are best.

## Project structure

```
src/
  App.tsx                   Chooses the control window or the projector view
  lib/types.ts              Data model
  lib/bible.ts              Bible file import, reference parsing, keyword search
  lib/lyrics.ts             Section tags and automatic slide splitting
  lib/slides.ts             Turns songs and passages into slides
  lib/storage.ts            Offline storage (Rust commands, or localStorage in a browser)
  lib/bridge.ts             Messages between windows (Tauri events / BroadcastChannel)
  lib/display.ts            List displays, open and close the projector
  lib/session.ts            The presentation session: slides, current slide, chapter run-on
  lib/liveKeys.ts           Which key does what on the control screen
  state/library.tsx         Library state, autosave and migration from v1
  components/
    ControlApp.tsx          Layout, live state, shortcuts
    Sidebar.tsx             Main navigation and projector status
    HomeScreen.tsx          Home: quick actions, recent songs, saved verses
    SettingsScreen.tsx      Projector, Bibles, Songs, Backup, Keyboard, About
    HelpScreen.tsx          Beginner's guide to presenting
    Page.tsx                Layout for the full-width screens
    BibleWorkspace.tsx      Translation, books, chapters, reading page, search, add bar
    BibleDialogs.tsx        Import Bibles and cross references; confirm removing a Bible
    SongsWorkspace.tsx      Song library, lyrics editor, slide arrangement
    PresentationPanel.tsx   Live controls: current and next slide, Previous/Next/Black, Start/Stop/Close, slide list
    LookPicker.tsx          A slide's background menu
    ShortcutTable.tsx       The keyboard shortcut table (list in lib/shortcuts.ts)
    SlideRenderer.tsx       Draws a slide at any size (thumbnails, preview, projector)
    PresentationView.tsx    Projector window
src-tauri/
  src/lib.rs                Commands: data files, displays, projector window, save dialog
  tauri.conf.json           App and bundle settings
scripts/fetch-kjv.mjs       Downloads the public-domain KJV for import
```

Libraries from version 0.1 are converted automatically: songs move to the tagged lyrics format with their play order kept. Old announcement slides stay in the data file but are no longer shown.

## Roadmap ideas

CCLI SongSelect import, a stage display for musicians, saved presentations, and API.Bible integration for licensed online scripture.
