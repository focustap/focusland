// ProtectedRoute component.
// Wraps pages that should only be visible to logged-in users.
import React, { useContext, useEffect } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "./AuthProvider";

type Props = {
  children: ReactNode;
};

export const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { session, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate("/login");
    }
  }, [loading, session, navigate]);

  if (loading) {
    return <div className="page">Checking session...</div>;
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
};

