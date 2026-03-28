import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";

const Brawl = lazy(() => import("./pages/Brawl"));
const BrawlPvE = lazy(() => import("./pages/BrawlPvE"));
const BrawlPvEWorld = lazy(() => import("./pages/BrawlPvEWorld"));
const ArcadeRoom = lazy(() => import("./pages/ArcadeRoom"));
const BrawlRoom = lazy(() => import("./pages/BrawlRoom"));
const CardBattle = lazy(() => import("./pages/CardBattle"));
const CardDeckWorkshop = lazy(() => import("./pages/CardDeckWorkshop"));
const CardRoom = lazy(() => import("./pages/CardRoom"));
const Casino = lazy(() => import("./pages/Casino"));
const CasinoRoom = lazy(() => import("./pages/CasinoRoom"));
const CatchGame = lazy(() => import("./pages/CatchGame"));
const Game = lazy(() => import("./pages/Game"));
const Gwent = lazy(() => import("./pages/Gwent"));
const Hallway13 = lazy(() => import("./pages/Hallway13"));
const InvadersRoom = lazy(() => import("./pages/InvadersRoom"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Lobby = lazy(() => import("./pages/Lobby"));
const Login = lazy(() => import("./pages/Login"));
const Pong = lazy(() => import("./pages/Pong"));
const Pool = lazy(() => import("./pages/Pool"));
const Profile = lazy(() => import("./pages/Profile"));
const RideTheBus = lazy(() => import("./pages/RideTheBus"));
const ShopRoom = lazy(() => import("./pages/ShopRoom"));
const Slots = lazy(() => import("./pages/Slots"));
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
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <Leaderboard />
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
                <CasinoRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/casino/21"
            element={
              <ProtectedRoute>
                <Casino />
              </ProtectedRoute>
            }
          />
          <Route
            path="/casino/slots"
            element={
              <ProtectedRoute>
                <Slots />
              </ProtectedRoute>
            }
          />
          <Route
            path="/casino/bus"
            element={
              <ProtectedRoute>
                <RideTheBus />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arcade"
            element={
              <ProtectedRoute>
                <ArcadeRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arcade/hallway-13"
            element={
              <ProtectedRoute>
                <Hallway13 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cards"
            element={
              <ProtectedRoute>
                <CardRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cards/play"
            element={
              <ProtectedRoute>
                <CardBattle />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cards/decks"
            element={
              <ProtectedRoute>
                <CardDeckWorkshop />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arena"
            element={
              <ProtectedRoute>
                <BrawlRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arena/pve"
            element={
              <ProtectedRoute>
                <BrawlPvEWorld />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arena/pve/:bossId"
            element={
              <ProtectedRoute>
                <BrawlPvE />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gwent"
            element={
              <ProtectedRoute>
                <Gwent />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hangar"
            element={
              <ProtectedRoute>
                <InvadersRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shop"
            element={
              <ProtectedRoute>
                <ShopRoom />
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
            path="/pool"
            element={
              <ProtectedRoute>
                <Pool />
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
