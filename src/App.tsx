import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Brawl from "./pages/Brawl";
import Casino from "./pages/Casino";
import CatchGame from "./pages/CatchGame";
import Game from "./pages/Game";
import Lobby from "./pages/Lobby";
import Login from "./pages/Login";
import Pong from "./pages/Pong";
import Profile from "./pages/Profile";
import SpaceInvaders from "./pages/SpaceInvaders";

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
    </AuthProvider>
  );
};

export default App;
