// Main application component.
// Defines the top-level routes and shared layout.
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Lobby from "./pages/Lobby";
import Profile from "./pages/Profile";
import Game from "./pages/Game";
import CatchGame from "./pages/CatchGame";
import Casino from "./pages/Casino";
import Pong from "./pages/Pong";
import { AuthProvider } from "./components/AuthProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";

const App = () => {
  return (
    <AuthProvider>
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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;

