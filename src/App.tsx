import { AddWordScreen } from "./components/AddWordScreen";

export const App = () => (
  <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720, margin: "0 auto" }}>
    <h1>German Vocabulary Trainer</h1>
    <p style={{ color: "#444" }}>
      Generate a draft card with LLM assistance, then edit and save it.
    </p>
    <AddWordScreen />
  </main>
);
