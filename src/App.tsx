import { AddWordScreen } from "./components/AddWordScreen";

export const App = () => (
  <main
    style={{
      fontFamily: "system-ui",
      padding: "32px 24px 48px",
      maxWidth: 980,
      margin: "0 auto",
      color: "#0f172a",
    }}
  >
    <h1 style={{ marginBottom: 8 }}>German Vocabulary Trainer</h1>
    <p style={{ color: "#475569", marginTop: 0 }}>
      Generate a draft card with LLM assistance, then edit and save it.
    </p>
    <AddWordScreen />
  </main>
);
