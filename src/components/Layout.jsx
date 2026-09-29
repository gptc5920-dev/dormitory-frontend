import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BellRing, Building2, Camera, ClipboardList, FileBarChart, Gauge, LogOut, Menu, MonitorPlay, ScrollText, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const links = [
  ["/", "Dashboard", Gauge], ["/tenants", "Tenants", Users],
  ["/rooms", "Rooms", Building2], ["/rules", "Dormitory rules", ScrollText],
  ["/incidents", "Incidents", ClipboardList], ["/records", "Warnings & violations", BellRing],
  ["/monitoring", "Monitoring", Camera], ["/camera-wall", "Camera Wall", MonitorPlay], ["/reports", "Reports", FileBarChart],
];

function Navigation({ onNavigate }) {
  const { user, logout } = useAuth();
  return <>
    <div className="brand"><span className="brand-mark"><Building2 size={22} /></span><span>Smart Dormitory<small>RESIDENCE MANAGEMENT</small></span></div>
    <p className="nav-caption">Workspace</p>
    <nav aria-label="Main navigation">{links.map(([to, label, Icon]) =>
      <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}><Icon size={18} /><span>{label}</span></NavLink>
    )}</nav>
    <div className="sidebar-note"><ShieldCheck size={22} /><strong>A better place to live.</strong><p>Your people, spaces, and daily operations in one place.</p></div>
    <div className="sidebar-user">
      <div className="avatar">{(user?.first_name || user?.username || "M")[0].toUpperCase()}</div>
      <div><strong>{user?.first_name || user?.username}</strong><span>{user?.role}</span></div>
      <button className="icon-button inverse" onClick={() => logout().catch(() => {})} title="Log out" aria-label="Log out"><LogOut size={18} /></button>
    </div>
  </>;
}

export default function Layout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const currentPage = links.find(([path]) => path === pathname)?.[1] || "Dashboard";
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 821px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  return <div className="app-shell">
    <a className="skip-link" href="#workspace">Skip to content</a>
    <aside className="sidebar desktop-sidebar"><Navigation /></aside>
    <div className="main-content">
      <header className="workspace-bar">
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild><button className="mobile-menu icon-button" aria-label="Open navigation"><Menu size={21} /></button></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="sidebar-scrim" />
            <Dialog.Content className="sidebar mobile-sidebar" aria-describedby={undefined}>
              <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
              <Dialog.Close asChild><button className="sidebar-close" aria-label="Close navigation"><X size={20} /></button></Dialog.Close>
              <Navigation onNavigate={() => setOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{currentPage}</strong></div>
        <span className="workspace-role"><ShieldCheck size={15} />{user?.role === "admin" ? "Administrator" : "Manager"} workspace</span>
      </header>
      <main id="workspace" tabIndex={-1}><Outlet /></main>
    </div>
  </div>;
}
