import React, { useState } from "react";
import playPng from "./01_Welcome.png";

export default function Main() {
  const [screen, setScreen] = useState("home");

  if (screen === "game") {
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <h2>🎲 Game Screen</h2>
        <p>Temporary game placeholder.</p>
        <button onClick={() => setScreen("home")}>Back</button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", marginTop: 40 }}>
      <h2>🎯 Lucky Draw For U</h2>
      <img
        src={playPng}
        alt="Play"
        role="button"
        aria-label="Play"
        style={{ width: 140, cursor: "pointer", marginTop: 16 }}
        onClick={() => setScreen("game")}
      />
    </div>
  );
}
