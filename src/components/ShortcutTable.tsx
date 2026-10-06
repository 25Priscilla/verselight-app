import { SHORTCUTS } from "../lib/shortcuts";

/** The presentation keys as a two-column table: the keys, then what they do. */
export function ShortcutTable() {
  return (
    <table className="shortcut-table">
      <tbody>
        {SHORTCUTS.map(([keys, action]) => (
          <tr key={action}>
            <td>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</td>
            <td>{action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
