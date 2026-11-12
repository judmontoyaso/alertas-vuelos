import AlertsApp from "./alerts-app";

export default function Home() {
  return (
    <>
      <header className="sign">
        <div className="sign-inner">
          <div className="sign-icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
          </div>
          <div>
            <h1>Alertas de vuelos</h1>
            <p>Elige una ruta y un precio tope. Te avisamos cuando el vuelo baje hasta ahí.</p>
          </div>
        </div>
      </header>
      <AlertsApp />
    </>
  );
}
