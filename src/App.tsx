import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";

const Brawl = lazy(() => import("./pages/Brawl"));
const Casino = lazy(() => import("./pages/Casino"));
const CatchGame = lazy(() => import("./pages/CatchGame"));
const Game = lazy(() => import("./pages/Game"));
const Lobby = lazy(() => import("./pages/Lobby"));
const Login = lazy(() => import("./pages/Login"));
const Pong = lazy(() => import("./pages/Pong"));
const Profile = lazy(() => import("./pages/Profile"));
const SpaceInvaders = lazy(() => import("./pages/SpaceInvaders"));

const RouteFallback = () => (
  <div className="page auth-page">
    <div className="content card">
      <p className="info">Loading page...</p>
    </div>
  </div>
);

const App = () => {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/lobby"
            element={
              <ProtectedRoute>
                <Lobby />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/game"
            element={
              <ProtectedRoute>
                <Game />
              </ProtectedRoute>
            }
          />
          <Route
            path="/catch"
            element={
              <ProtectedRoute>
                <CatchGame />
              </ProtectedRoute>
            }
          />
          <Route
            path="/casino"
            element={
              <ProtectedRoute>
                <Casino />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pong"
            element={
              <ProtectedRoute>
                <Pong />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invaders"
            element={
              <ProtectedRoute>
                <SpaceInvaders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/brawl"
            element={
              <ProtectedRoute>
                <Brawl />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
};

export default App;
