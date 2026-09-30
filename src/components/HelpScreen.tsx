import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { Page } from "./Page";
import type { SettingsSection } from "./SettingsScreen";
import { ShortcutTable } from "./ShortcutTable";
import type { Mode } from "./Sidebar";
import { Card } from "./ui";

interface Props {
  onOpen: (mode: Mode) => void;
  onSettings: (section: SettingsSection) => void;
}

const STEPS: { title: string; text: ReactNode }[] = [
  { title: "Find it", text: <>Open <strong>Bible</strong> and choose a book and chapter, or type a reference such as <em>John 3:16</em>. For a song, open <strong>Songs</strong> and search.</> },
  { title: "Select it", text: <>Click the verse you want to start from. For a song, click it in the list.</> },
  { title: "Present Now", text: <>Press the red <strong>Present Now</strong> button. The slide appears on the projector, and the presentation controls open on the right.</> },
  { title: "Move and finish", text: <>Use <strong>Next</strong> and <strong>Previous</strong> to move. When you're done, press <strong>Stop presentation</strong>, then <strong>Close</strong>.</> },
];

/** Plain-language help for whoever is running the screen on the day. */
export function HelpScreen({ onOpen, onSettings }: Props) {
  const links: { icon: IconName; label: string; onClick: () => void }[] = [
    { icon: "image", label: "Change the background and text style", onClick: () => onOpen("backgrounds") },
    { icon: "monitor", label: "Choose which screen shows the slides", onClick: () => onSettings("projector") },
    { icon: "book", label: "Add or remove a Bible", onClick: () => onSettings("bibles") },
    { icon: "music", label: "Add songs from files", onClick: () => onSettings("songs") },
    { icon: "download", label: "Back up or restore your library", onClick: () => onSettings("backup") },
    { icon: "info", label: "Version and credits", onClick: () => onSettings("about") },
  ];

  return (
    <Page title="Help" intro="How to find a passage or song and show it on the projector." className="help-page">
      <section className="help-steps" aria-labelledby="help-steps-title">
        <h2 id="help-steps-title">How to present in 4 steps</h2>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="help-step-num" aria-hidden>{i + 1}</span>
              <strong>{s.title}</strong>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="help-grid">
        <Topic icon="book" title="Present a Bible verse">
          <ol>
            <li>Open <strong>Bible</strong> and pick a book, then a chapter from the numbers under the book name (the arrows go to the previous or next chapter, even into the next book). Or type a reference in the search box and press Enter.</li>
            <li>Click a verse to select it. To select several, click the first verse, then hold <kbd>Shift</kbd> and click the last.</li>
            <li>Press <strong>Present Now</strong> (or <kbd>Enter</kbd>).</li>
          </ol>
          <p className="muted">Each verse is its own slide. Next keeps going past the verses you selected, and on into the next chapter.</p>
        </Topic>

        <Topic icon="study" title="Study the Bible">
          <ul>
            <li><strong>Overview</strong>, next to <strong>Reading</strong> above the chapter, lists that chapter's sections and its most cross-referenced verses.</li>
            <li><strong>Cross references</strong>, in the bar at the bottom, shows passages related to the verses you selected.</li>
            <li><strong>Save</strong> keeps the selected verses in <strong>Bible Study</strong>, where you can open, present or remove them.</li>
            <li>After a keyword search, <strong>Word Study</strong> shows every place the word appears, book by book.</li>
          </ul>
          <p className="muted">Study tools use only data stored in VerseLight. There are no written chapter summaries, and no Hebrew or Greek word data yet.</p>
        </Topic>

        <Topic icon="music" title="Present a song">
          <ol>
            <li>Open <strong>Songs</strong> and search by title or by words from the lyrics. Press <kbd>Enter</kbd> to open the first match.</li>
            <li>Check the slides on the right. Move a section with its arrows, or click a slide to leave it out.</li>
            <li>Press <strong>Present Now</strong>. You can also press the ▶ next to a song in the list.</li>
            <li>To start part-way through, press the ▶ on that slide in the song.</li>
          </ol>
          <p className="muted">Each verse and chorus is its own slide, in the order the song is sung. The slide on the projector is marked <em>Now</em>. Changes to the words show on the screen straight away.</p>
        </Topic>

        <Topic icon="next" title="Previous and Next">
          <p>Press <strong>Next</strong> to go forward one slide and <strong>Previous</strong> to go back. The keyboard and most presentation clickers work too.</p>
          <p>To jump to any slide, click it in the slide list on the right.</p>
          <p className="muted">The preview shows exactly what the projector shows, with your place (for example <em>Slide 3 of 12</em>). Underneath it you can see what comes next.</p>
        </Topic>

        <Topic icon="square" title="Black screen">
          <p>Press <strong>Black</strong> (or <kbd>B</kbd>) to make the projector go black, for example during prayer or between items.</p>
          <p>Press <strong>Show</strong> (or <kbd>B</kbd> again) to bring the slide back. Your place isn't lost.</p>
        </Topic>

        <Topic icon="stop" title="Stop and close">
          <p><strong>Stop presentation</strong> (or <kbd>Esc</kbd>) turns the projector screen off but keeps your place. <strong>Start presenting</strong> brings it back on the same slide.</p>
          <p><strong>Close</strong>, next to Stop presentation, clears the presentation and hides the controls.</p>
        </Topic>

        <Topic icon="monitor" title="Projector status">
          <p>The <strong>Projector</strong> item at the bottom left shows whether slides are on the screen: <em>Off</em>, <em>Connecting…</em> or <em>Live</em>, with the screen's name.</p>
          <p>Click it to choose which screen shows the slides.</p>
        </Topic>
      </div>

      <Card title="Keyboard and clicker">
        <p className="muted small">These work while presenting, as long as you're not typing in a box. If a box has the cursor, press Esc once first.</p>
        <ShortcutTable />
      </Card>

      <Card title="Where to find things">
        <ul className="help-links">
          {links.map((l) => (
            <li key={l.label}>
              <button onClick={l.onClick}><Icon name={l.icon} size={16} /><span>{l.label}</span><Icon name="next" size={16} /></button>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}

function Topic({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="help-topic" aria-label={title}>
      <h3><span className="help-topic-icon"><Icon name={icon} size={16} /></span>{title}</h3>
      {children}
    </section>
  );
}
