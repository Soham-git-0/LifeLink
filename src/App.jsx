import React, { useEffect, useMemo, useState } from 'react';
import AuthScreen from './AuthScreen';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  ClipboardList,
  Database,
  Droplets,
  GitBranch,
  HeartPulse,
  History,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Plus,
  ChevronDown
} from 'lucide-react';
import { LogOut } from 'lucide-react';

const API_BASE = 'http://localhost:5001';
async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
  });

  return response;
}


/* =========================================================
   NAVIGATION
========================================================= */

const nav = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    id: 'donors',
    label: 'Donors',
    icon: Users
  },
  {
    id: 'recipients',
    label: 'Recipients',
    icon: Stethoscope
  },
  {
    id: 'blood',
    label: 'Blood Inventory',
    icon: Droplets
  },
  {
    id: 'organs',
    label: 'Organ Inventory',
    icon: HeartPulse
  },
  {
    id: 'requests',
    label: 'Requests',
    icon: ClipboardList
  },
  {
    id: 'matching',
    label: 'Compatibility Matching',
    icon: ShieldCheck
  },
  {
    id: 'hospitals',
    label: 'Hospitals / Branches',
    icon: Building2
  },
  {
    id: 'allocation',
    label: 'Allocation',
    icon: Package
  },
  {
    id: 'audit',
    label: 'Audit History',
    icon: History
  }
];


/* =========================================================
   MAIN APP
========================================================= */

function App() {

  const [active, setActive] = useState('dashboard');
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [search, setSearch] = useState('');

  /*
   * Donors retrieved from Flask/MySQL
   */
  const [donors, setDonors] = useState([]);

  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleLogout = async () => {
  try {
    const response = await apiFetch('/api/auth/logout', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Logout failed');
    }

    setCurrentUser(null);
    setActive('dashboard');
    setAuthMode('login');
  } catch (error) {
    console.error('Logout failed:', error);
    alert('Unable to log out. Please try again.');
  }
};

  const performSearch = async (query) => {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    setSearchResults([]);
    return;
  }

  try {
    setSearchLoading(true);

    const [
      donorsResponse,
      recipientsResponse,
      bloodResponse,
      organsResponse,
      requestsResponse,
      hospitalsResponse
    ] = await Promise.all([
      apiFetch('/api/donors'),
      apiFetch('/api/recipients'),
      apiFetch('/api/blood-units'),
      apiFetch('/api/organs'),
      apiFetch('/api/requests'),
      apiFetch('/api/hospitals')
    ]);

    const [
      donorsData,
      recipientsData,
      bloodData,
      organsData,
      requestsData,
      hospitalsData
    ] = await Promise.all([
      donorsResponse.json(),
      recipientsResponse.json(),
      bloodResponse.json(),
      organsResponse.json(),
      requestsResponse.json(),
      hospitalsResponse.json()
    ]);

    const q = trimmedQuery.toLowerCase();
    const results = [];

    (donorsData.donors || []).forEach(donor => {
      const text = JSON.stringify(donor).toLowerCase();

      if (text.includes(q)) {
        results.push({
          type: 'Donor',
          id: donor.donor_id,
          title: donor.full_name,
          subtitle: `${donor.blood_group || ''} ${donor.rh_factor || ''}`.trim(),
          module: 'donors'
        });
      }
    });

    (recipientsData.recipients || []).forEach(recipient => {
      const text = JSON.stringify(recipient).toLowerCase();

      if (text.includes(q)) {
        results.push({
          type: 'Recipient',
          id: recipient.recipient_id,
          title: recipient.full_name,
          subtitle: `${recipient.blood_group || ''} ${recipient.rh_factor || ''}`.trim(),
          module: 'recipients'
        });
      }
    });

    (bloodData.blood_units || []).forEach(unit => {
      const text = JSON.stringify(unit).toLowerCase();

      if (text.includes(q)) {
        results.push({
          type: 'Blood Unit',
          id: unit.blood_unit_id,
          title: `Blood Unit #${unit.blood_unit_id}`,
          subtitle: `${unit.blood_group || ''} ${unit.rh_factor || ''} • ${unit.status || ''}`,
          module: 'blood'
        });
      }
    });

    (organsData.organs || []).forEach(organ => {
      const text = JSON.stringify(organ).toLowerCase();

      if (text.includes(q)) {
        results.push({
          type: 'Organ',
          id: organ.organ_id,
          title: `Organ #${organ.organ_id}`,
          subtitle: `${organ.organ_type || ''} • ${organ.status || ''}`,
          module: 'organs'
        });
      }
    });

    (requestsData.requests || []).forEach(request => {
      const text = JSON.stringify(request).toLowerCase();

      if (text.includes(q)) {
        results.push({
          type: 'Request',
          id: request.request_id,
          title: `Request #${request.request_id}`,
          subtitle: `${request.request_type || ''} • ${request.status || ''}`,
          module: 'requests'
        });
      }
    });

    (hospitalsData.hospitals || []).forEach(hospital => {
      const text = JSON.stringify(hospital).toLowerCase();

      if (text.includes(q)) {
        results.push({
          type: 'Hospital',
          id: hospital.hospital_id,
          title: hospital.hospital_name,
          subtitle: hospital.branch_name || '',
          module: 'hospitals'
        });
      }
    });

    setSearchResults(results);
  } catch (error) {
    console.error('Search failed:', error);
    setSearchResults([]);
  } finally {
    setSearchLoading(false);
  }
};

const loadNotifications = async () => {
  try {
    const [
      requestsResponse,
      bloodResponse,
      organsResponse
    ] = await Promise.all([
      apiFetch('/api/requests'),
      apiFetch('/api/blood-units'),
      apiFetch('/api/organs')
    ]);

    const [
      requestsData,
      bloodData,
      organsData
    ] = await Promise.all([
      requestsResponse.json(),
      bloodResponse.json(),
      organsResponse.json()
    ]);

    const alerts = [];

    const pendingRequests =
      (requestsData.requests || []).filter(
        request => request.status === 'Pending'
      );

    if (pendingRequests.length > 0) {
      alerts.push({
        id: 'pending-requests',
        title: 'Pending requests',
        message: `${pendingRequests.length} request${pendingRequests.length > 1 ? 's' : ''} awaiting processing.`,
        module: 'requests'
      });
    }

    const availableBlood =
      (bloodData.blood_units || []).filter(
        unit => unit.status === 'Available'
      );

    if (availableBlood.length === 0) {
      alerts.push({
        id: 'blood-unavailable',
        title: 'Blood stock unavailable',
        message: 'No blood units are currently available.',
        module: 'blood'
      });
    }

    const organs = organsData.organs || [];

    const expiredOrgans = organs.filter(organ => {
      if (!organ.viability_until) return false;
      return new Date(organ.viability_until) <= new Date();
    });

    if (expiredOrgans.length > 0) {
      alerts.push({
        id: 'expired-organs',
        title: 'Organ viability alert',
        message: `${expiredOrgans.length} organ${expiredOrgans.length > 1 ? 's have' : ' has'} passed its viability window.`,
        module: 'organs'
      });
    }

    setNotifications(alerts);
  } catch (error) {
    console.error('Could not load notifications:', error);
    setNotifications([]);
  }
};
useEffect(() => {
  const checkSession = async () => {
    try {
      const response = await apiFetch('/api/auth/me');

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch (error) {
      console.error('Session check failed:', error);
    } finally {
      setAuthLoading(false);
    }
  };

  checkSession();
}, []);

  const current =
    nav.find(n => n.id === active) || nav[0];

    if (authLoading) {
  return <div className="auth-screen">Checking your session...</div>;
}

if (!currentUser) {
  return <AuthScreen onLogin={setCurrentUser} />;
}


  return (
    <div className="app-shell">

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`sidebar ${sidebarOpen ? 'open' : ''}`}
      >

        <div className="brand">

          <div className="brand-mark">
            <Droplets
              size={22}
              fill="currentColor"
            />
          </div>

          <div>
            <strong>LifeLink</strong>
            <span>Blood & Organ Network</span>
          </div>

        </div>


        <div className="network-badge">

          <span className="pulse-dot" />

          Central Hospital Network

        </div>


        <nav className="nav-list">

          <div className="nav-label">
            WORKSPACE
          </div>


          {nav.map(item => {

            const Icon = item.icon;

            return (

              <button
                key={item.id}
                className={`nav-item ${
                  active === item.id ? 'active' : ''
                }`}

                onClick={() => {
                  setActive(item.id);
                  setSidebarOpen(false);
                }}
              >

                <Icon size={18} />

                <span>
                  {item.label}
                </span>

                {active === item.id && (
                  <span className="active-line" />
                )}

              </button>

            );

          })}

        </nav>


        <div className="sidebar-bottom">

        
        <button
        className="nav-item"
        onClick={() => setSettingsOpen(true)}
        >
          <Settings size={18} />
          <span>
            Settings
            </span>
            </button>


            <button onClick={handleLogout} className="logout-btn">
              <LogOut size={18} />
              <span>Logout</span>
              </button>


          <div style={{ position: 'relative' }}>

  <button
    className="user-card"
    onClick={() => setProfileOpen(!profileOpen)}
    style={{
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      width: '100%',
      textAlign: 'left'
    }}
  >

    <div className="avatar">
  {(currentUser.full_name || 'U')
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()}
</div>

    <div>

      <strong>
  {currentUser.full_name}
</strong>

<span>
  {currentUser.role}
</span>

    </div>

    <ChevronDown size={15} />

  </button>

  {profileOpen && (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 10px)',
        left: 0,
        width: '240px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        zIndex: 1000,
        overflow: 'hidden'
      }}
    >

    
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #f0f0f0'
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: '#111827',
            marginBottom: '4px'
          }}
        >
          {currentUser.full_name}
        </div>

        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          {currentUser.role}
        </div>

        <div
          style={{
            fontSize: '12px',
            color: '#6b7280',
            marginTop: '5px',
            lineHeight: 1.5
          }}
        >
          {currentUser.hospital_name} — {currentUser.branch_name}
          <br />
          {currentUser.city}, {currentUser.state}
        </div>

        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
          {currentUser.email}
        </div>
      </div>


      <button
        onClick={() => {
          setActive('hospitals');
          setProfileOpen(false);
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          background: '#ffffff',
          textAlign: 'left',
          cursor: 'pointer',
          color: '#374151'
        }}
      >
        View Hospital Branches
      </button>

      <button
        onClick={() => {
          setActive('audit');
          setProfileOpen(false);
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          borderTop: '1px solid #f0f0f0',
          background: '#ffffff',
          textAlign: 'left',
          cursor: 'pointer',
          color: '#374151'
        }}
      >
        View Audit History
      </button>

    </div>
  )}

</div>

        </div>

      </aside>

{settingsOpen && (
  <div
    onClick={() => setSettingsOpen(false)}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.35)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}
  >

    <div
      onClick={e => e.stopPropagation()}
      style={{
        width: '420px',
        maxWidth: '90%',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        padding: '24px'
      }}
    >

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >

        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '20px',
              color: '#111827'
            }}
          >
            Settings
          </h2>

          <p
            style={{
              margin: '5px 0 0',
              fontSize: '13px',
              color: '#6b7280'
            }}
          >
            Manage dashboard preferences
          </p>
        </div>

        <button
          onClick={() => setSettingsOpen(false)}
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: '22px',
            cursor: 'pointer',
            color: '#6b7280'
          }}
        >
          ×
        </button>

      </div>

      <div
        style={{
          padding: '14px 0',
          borderTop: '1px solid #f0f0f0',
          borderBottom: '1px solid #f0f0f0'
        }}
      >

        <div
          style={{
            fontWeight: 600,
            color: '#111827',
            marginBottom: '4px'
          }}
        >
          System
        </div>

        <div
          style={{
            fontSize: '13px',
            color: '#6b7280'
          }}
        >
          Blood & Organ Donor Management System
        </div>

      </div>

      <div style={{ marginTop: '18px' }}>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 0'
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                color: '#111827'
              }}
            >
              Notifications
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '3px'
              }}
            >
              Show system alerts
            </div>
          </div>

          <span
            style={{
              padding: '5px 10px',
              borderRadius: '20px',
              background: '#ecfdf5',
              color: '#047857',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Enabled
          </span>

        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 0'
          }}
        >

          <div>
            <div
              style={{
                fontWeight: 600,
                color: '#111827'
              }}
            >
              Database
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '3px'
              }}
            >
              Connected through Flask + MySQL
            </div>
          </div>

          <span
            style={{
              padding: '5px 10px',
              borderRadius: '20px',
              background: '#ecfdf5',
              color: '#047857',
              fontSize: '12px',
              fontWeight: 600
            }}
          >
            Connected
          </span>

        </div>

      </div>

      <button
        onClick={() => setSettingsOpen(false)}
        style={{
          width: '100%',
          marginTop: '20px',
          padding: '11px',
          border: 'none',
          borderRadius: '9px',
          background: '#111827',
          color: '#ffffff',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        Close
      </button>

    </div>

  </div>
)}


      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="main">


        {/* ===================================================
            TOP BAR
        =================================================== */}

        <header className="topbar">

          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen(true)}
          >

            <Menu size={22} />

          </button>


          <div className="breadcrumbs">

            <span>
              Workspace
            </span>

            <ArrowRight size={14} />

            <strong>
              {current.label}
            </strong>

          </div>


          <div className="top-actions">

<div className="search-box" style={{ position: 'relative' }}>

  <Search size={17} />

  <input
    value={search}
    onChange={async e => {
      const value = e.target.value;
      setSearch(value);
      await performSearch(value);
    }}
    placeholder="Search records..."
  />

  {search && (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        zIndex: 1000,
        maxHeight: '360px',
        overflowY: 'auto',
        minWidth: '320px'
      }}
    >

      {searchLoading ? (
        <div style={{ padding: '16px', color: '#6b7280' }}>
          Searching...
        </div>
      ) : searchResults.length === 0 ? (
        <div style={{ padding: '16px', color: '#6b7280' }}>
          No records found.
        </div>
      ) : (
        searchResults.map((result, index) => (
          <button
            key={`${result.type}-${result.id}-${index}`}
            onClick={() => {
              setActive(result.module);
              setSearch('');
              setSearchResults([]);
            }}
            style={{
              width: '100%',
              display: 'block',
              textAlign: 'left',
              padding: '12px 14px',
              border: 'none',
              borderBottom:
                index < searchResults.length - 1
                  ? '1px solid #f0f0f0'
                  : 'none',
              background: 'transparent',
              cursor: 'pointer'
            }}
          >

            <div
              style={{
                fontWeight: 600,
                color: '#111827',
                marginBottom: '3px'
              }}
            >
              {result.title}
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#6b7280'
              }}
            >
              {result.type}
              {result.subtitle ? ` • ${result.subtitle}` : ''}
            </div>

          </button>
        ))
      )}

    </div>
  )}

</div>


            <div style={{ position: 'relative' }}>

  <button
    className="icon-btn notification"
    onClick={async () => {
      const nextState = !notificationsOpen;
      setNotificationsOpen(nextState);

      if (nextState) {
        await loadNotifications();
      }
    }}
  >

    <Bell size={18} />

    {notifications.length > 0 && <i />}

  </button>

  {notificationsOpen && (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        right: 0,
        width: '360px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
        zIndex: 1000,
        overflow: 'hidden'
      }}
    >

      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 700,
          color: '#111827'
        }}
      >
        Notifications
      </div>

      {notifications.length === 0 ? (

        <div
          style={{
            padding: '20px 16px',
            color: '#6b7280',
            fontSize: '14px'
          }}
        >
          No new notifications.
        </div>

      ) : (

        notifications.map(notification => (
          <button
            key={notification.id}
            onClick={() => {
              setActive(notification.module);
              setNotificationsOpen(false);
            }}
            style={{
              width: '100%',
              padding: '14px 16px',
              textAlign: 'left',
              border: 'none',
              borderBottom: '1px solid #f0f0f0',
              background: '#ffffff',
              cursor: 'pointer'
            }}
          >

            <div
              style={{
                fontWeight: 600,
                color: '#111827',
                marginBottom: '4px'
              }}
            >
              {notification.title}
            </div>

            <div
              style={{
                fontSize: '13px',
                color: '#6b7280',
                lineHeight: 1.4
              }}
            >
              {notification.message}
            </div>

          </button>
        ))

      )}

    </div>
  )}

</div>

          </div>

        </header>


        {/* ===================================================
            CONTENT
        =================================================== */}

        <div className="content">
  {active === 'dashboard' ? (
    <Dashboard
      setActive={setActive}
    />
  ) : active === 'donors' ? (
  <DonorPage
  donors={donors}
  setDonors={setDonors}
  isAdmin={currentUser.role === 'System Admin'}
  />

  ) : active === 'recipients' ? (
    <RecipientsPage
  isAdmin={currentUser.role === 'System Admin'}
/>
  ) : active === 'blood' ? (
    <BloodInventoryPage
  isAdmin={currentUser.role === 'System Admin'}
/>
  ) : active === 'organs' ? (
    <OrganInventoryPage
  isAdmin={currentUser.role === 'System Admin'}
/>
  ) : active === 'requests' ? (
    <RequestsPage isAdmin={currentUser.role === 'System Admin'} />
  ) : active === 'matching' ? (
  <CompatibilityPage />
) : active === 'allocation' ? (
  <AllocationPage />
) : active === 'hospitals' ? (
  <HospitalsPage isAdmin={currentUser.role === 'System Admin'} />
) : active === 'audit' ? (
  <AuditHistoryPage />
) : (
  <ModulePage active={active} />
)}
</div>

      </main>

    </div>
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({ setActive }) {
  const [dashboardStats, setDashboardStats] = useState([]);
  const [recentMatchesData, setRecentMatchesData] = useState([]);
  const [dashboardAlerts, setDashboardAlerts] = useState([]);

  const [dashboardBloodUnits, setDashboardBloodUnits] = useState([]);
  const [dashboardOrgans, setDashboardOrgans] = useState([]);
  const [dashboardRequests, setDashboardRequests] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [
        donorsResponse,
        recipientsResponse,
        bloodResponse,
        organsResponse,
        requestsResponse,
        allocationsResponse
      ] = await Promise.all([
        apiFetch('/api/donors'),
        apiFetch('/api/recipients'),
        apiFetch('/api/blood-units'),
        apiFetch('/api/organs'),
        apiFetch('/api/requests'),
        apiFetch('/api/allocations')
      ]);

      const donorsData = await donorsResponse.json();
      const recipientsData = await recipientsResponse.json();
      const bloodData = await bloodResponse.json();
      const organsData = await organsResponse.json();
      const requestsData = await requestsResponse.json();
      const allocationsData = await allocationsResponse.json();

      const donors = donorsData.donors || [];
      const recipients = recipientsData.recipients || [];
      const bloodUnits = bloodData.blood_units || [];
      const organs = organsData.organs || [];
      const requests = requestsData.requests || [];
      const allocations = allocationsData.allocations || [];

      setDashboardBloodUnits(bloodUnits);
      setDashboardOrgans(organs);
      setDashboardRequests(requests);

      setDashboardStats([
        {
          label: 'Total Donors',
          value: donors.length,
          tone: 'teal',
          icon: <Users size={18} />
        },
        {
          label: 'Recipients',
          value: recipients.length,
          tone: 'blue',
          icon: <Stethoscope size={18} />
        },
        {
          label: 'Blood Units',
          value: bloodUnits.length,
          tone: 'red',
          icon: <Droplets size={18} />
        },
        {
          label: 'Organs',
          value: organs.length,
          tone: 'purple',
          icon: <HeartPulse size={18} />
        },
        {
          label: 'Requests',
          value: requests.length,
          tone: 'amber',
          icon: <ClipboardList size={18} />
        },
        {
          label: 'Allocations',
          value: allocations.length,
          tone: 'green',
          icon: <Package size={18} />
        }
      ]);

      setRecentMatchesData(
        allocations.slice(0, 5).map(allocation => ({
          id: `#${allocation.request_id}`,
          type: allocation.blood_unit_id !== null ? 'Blood' : 'Organ',
          compatibility: allocation.blood_unit_id !== null
            ? `Blood Unit #${allocation.blood_unit_id}`
            : `Organ #${allocation.organ_id}`,
          status: allocation.allocation_status,
          tone: allocation.allocation_status === 'Reserved'
            ? 'good'
            : 'neutral'
        }))
      );
      const alerts = [];
      const availableBloodUnits = bloodUnits.filter(
        unit => unit.status === 'Available'
      );
      if (availableBloodUnits.length === 0) {
      alerts.push({
        type: 'red',
        title: 'Blood stock unavailable',
        message: 'No blood units are currently available.'
      });
    }
    const availableOrgans = organs.filter(
      organ => organ.status === 'Available'
    );

    if (availableOrgans.length === 0) {
      alerts.push({
        type: 'amber',
        title: 'Organ availability',
        message: 'No organs are currently available for allocation.'
      });
    }
    const pendingRequests = requests.filter(
      request => request.status === 'Pending'
    );

    if (pendingRequests.length > 0) {
      alerts.push({
        type: 'teal',
        title: 'Pending requests',
        message: `${pendingRequests.length} request${
          pendingRequests.length === 1 ? '' : 's'
        } awaiting processing.`
       });
      }

      setDashboardAlerts(alerts);
        } catch (error) {
          console.error('Dashboard loading error:', error);
        } finally {
          setLoading(false);
        }
      };

      return (
      <>

      {/* HERO */}

      <section className="hero">

        <div>

          <div className="eyebrow">

            <Activity size={14} />

            LIVE NETWORK OVERVIEW

          </div>


          <h1>
            Blood & Organ Management
          </h1>


          <p>
            Centralized donor, inventory, request and
            compatibility management across hospital branches.
          </p>

        </div>


        <button
          className="primary-btn"

          onClick={() =>
            setActive('requests')
          }
        >

          <Plus size={17} />

          New Request

        </button>

      </section>


      {/* STATS */}

      <div className="stats-grid">

        {dashboardStats.map(s => (

          <div
            className="stat-card"
            key={s.label}
          >

            <div
              className={`stat-icon ${s.tone}`}
            >
              {s.icon}
            </div>


            <div className="stat-copy">

              <span>
                {s.label}
              </span>

              <strong>
                {s.value}
              </strong>

            </div>


            <div className="mini-trend">
              Live
            </div>

          </div>

        ))}

      </div>


      {/* DASHBOARD GRID */}

      <div className="dashboard-grid">


        {/* RECENT MATCHES */}

        <section className="panel matches-panel">

          <div className="panel-head">

            <div>

              <span className="section-kicker">
                RECENT ACTIVITY
              </span>

              <h2>
                Recent Match Results
              </h2>

            </div>


            <button
              className="text-btn"

              onClick={() =>
                setActive('matching')
              }
            >

              View matching

              <ArrowRight size={15} />

            </button>

          </div>


          <div className="table-wrap">

            <table>

              <thead>

                <tr>

                  <th>
                    Request
                  </th>

                  <th>
                    Type
                  </th>

                  <th>
                    Compatibility
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>

                {recentMatchesData.map(m => (

                  <tr key={m.id}>

                    <td>
                      <strong>
                        {m.id}
                      </strong>
                    </td>


                    <td>

                      <span
                        className={`type-pill ${
                          m.type.toLowerCase()
                        }`}
                      >
                        {m.type}
                      </span>

                    </td>


                    <td>
                      {m.compatibility}
                    </td>


                    <td>

                      <span
                        className={`status ${m.tone}`}
                      >
                        {m.status}
                      </span>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </section>


        {/* ALERTS */}

        <section className="panel alerts-panel">

          <div className="panel-head">

            <div>

              <span className="section-kicker">
                ATTENTION
              </span>

              <h2>
                System Alerts
              </h2>

            </div>


            <button className="icon-btn">

              <Bell size={16} />

            </button>

          </div>


          {dashboardAlerts.length === 0 ? (
            <div className="empty-state">
              <p>No active alerts.</p>
              </div>
              ) : (
                dashboardAlerts.map((alert, index) => (
                  <div
                  className={`alert-item ${alert.type}`}
                  key={index}
                  >
                    <div className="alert-icon">
                      {alert.type === 'red' ? (
                        <Droplets size={17} />
                      ) : alert.type === 'amber' ? (
                      <AlertTriangle size={17} />
                    ) : (
                    <Bell size={17} />
                    )}
                    </div>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                      </div>
                      <ArrowRight size={15} />
                      </div>
                      ))
                      )}

        </section>

      </div>


      {/* BOTTOM GRID */}

      <div className="bottom-grid">


        {/* QUICK ACTIONS */}

        <section className="panel quick-panel">

          <div className="panel-head">

            <div>

              <span className="section-kicker">
                SHORTCUTS
              </span>

              <h2>
                Quick Actions
              </h2>

            </div>

          </div>


          <div className="quick-actions">


            <button
              onClick={() =>
                setActive('donors')
              }
            >

              <Users size={19} />

              <span>
                Register Donor
              </span>

              <ArrowRight size={15} />

            </button>


            <button
              onClick={() =>
                setActive('recipients')
              }
            >

              <Stethoscope size={19} />

              <span>
                Add Recipient
              </span>

              <ArrowRight size={15} />

            </button>


            <button
              onClick={() =>
                setActive('blood')
              }
            >

              <Droplets size={19} />

              <span>
                Add Blood Unit
              </span>

              <ArrowRight size={15} />

            </button>


            <button
              onClick={() =>
                setActive('organs')
              }
            >

              <HeartPulse size={19} />

              <span>
                Register Organ
              </span>

              <ArrowRight size={15} />

            </button>


          </div>

        </section>


        {/* INVENTORY AVAILABILITY */}
        <section className="panel network-panel">
            <div className="panel-head">
              <div>
                <span className="section-kicker">
                  INVENTORY
                  </span>
                  <h2>
                    Current Availability
                    </h2>
                    </div>
                    </div>
                    <div className="branch">
                      <div className="branch-info">
                        <div className="branch-icon">
                          <Droplets size={18} />
                          </div>
                          <div>
                            <strong>
                              Blood Inventory
                              </strong>
                              <span>
                                {dashboardBloodUnits.filter(
                                  unit => unit.status === 'Available'
                                  ).length} available · {dashboardBloodUnits.length} total
                                  </span>
                                  </div>
                                  </div>
                                  <span className={
                                    dashboardBloodUnits.some(unit => unit.status === 'Available')
                                    ? 'online'
                                    : 'warning'
                                    }>
                                      {dashboardBloodUnits.some(unit => unit.status === 'Available')
        ? 'AVAILABLE'
        : 'UNAVAILABLE'}
    </span>

  </div>


  <div className="branch">

    <div className="branch-info">

      <div className="branch-icon">
        <HeartPulse size={18} />
      </div>

      <div>

        <strong>
          Organ Inventory
        </strong>

        <span>
          {dashboardOrgans.filter(
            organ => organ.status === 'Available'
          ).length} available · {dashboardOrgans.length} total
        </span>

      </div>

    </div>

    <span className={
      dashboardOrgans.some(organ => organ.status === 'Available')
        ? 'online'
        : 'warning'
    }>
      {dashboardOrgans.some(organ => organ.status === 'Available')
        ? 'AVAILABLE'
        : 'UNAVAILABLE'}
    </span>

  </div>


  <div className="branch">

    <div className="branch-info">

      <div className="branch-icon">
        <ClipboardList size={18} />
      </div>

      <div>

        <strong>
          Pending Requests
        </strong>

        <span>
          {dashboardRequests.filter(
            request => request.status === 'Pending'
          ).length} awaiting processing
        </span>

      </div>

    </div>

    <span className={
      dashboardRequests.some(request => request.status === 'Pending')
        ? 'warning'
        : 'online'
    }>
      {dashboardRequests.some(request => request.status === 'Pending')
        ? 'PENDING'
        : 'CLEAR'}
    </span>

  </div>

</section>

      </div>

    </>
  );
}


/* =========================================================
   DONOR MANAGEMENT
========================================================= */

function DonorPage({ donors, setDonors, isAdmin }) {

  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);


  const [form, setForm] = useState({
    hospital_id: 1,
    
    full_name: '',

    date_of_birth: '',

    gender: '',

    blood_group: '',

    rh_factor: '',

    phone: '',

    email: '',

    medical_notes: '',

    eligibility_status: 'Eligible'

  });


  /* =======================================================
     LOAD DONORS
  ======================================================= */

  const loadDonors = async () => {

    try {

      const response = await apiFetch('/api/donors');


      const data = await response.json();


      if (data.success) {

        setDonors(data.donors || []);

      } else {

        alert(
          data.error || 'Failed to load donors'
        );

      }

    } catch (error) {

      console.error(
        'Error loading donors:',
        error
      );

      alert(
        'Could not connect to Flask backend.'
      );

    }

  };
  useEffect(() => {
    loadDonors();
  }, []);

  /* =======================================================
     FORM CHANGE
  ======================================================= */

  const handleChange = e => {

    setForm({

      ...form,

      [e.target.name]: e.target.value

    });

  };


  /* =======================================================
     REGISTER DONOR
  ======================================================= */

  const handleSubmit = async e => {

    e.preventDefault();

    setLoading(true);


    try {

      const response = await apiFetch('/api/donors', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(form)
});

      const data = await response.json();


      if (data.success) {

        alert(
          'Donor registered successfully!'
        );


        /* Reset form */

        setForm({
          hospital_id: 1,
          full_name: '',
          date_of_birth: '',
          gender: '',
          blood_group: '',
          rh_factor: '',
          phone: '',
          email: '',
          medical_notes: '',
          eligibility_status: 'Eligible'
        });


        setShowForm(false);


        /* Reload donors from database */

        await loadDonors();


      } else {

        alert(
          data.error ||
          'Failed to register donor'
        );

      }


    } catch (error) {

      console.error(
        'Register donor error:',
        error
      );

      alert(
        'Could not connect to Flask backend.'
      );


    } finally {

      setLoading(false);

    }

  };

const handleDeleteDonor = async (donorId) => {
  if (!window.confirm(
    `Delete donor #${donorId}? This action cannot be undone.`
  )) {
    return;
  }

  try {
    const response = await apiFetch(
      `/api/donors/${donorId}`,
      { method: 'DELETE' }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      alert(data.error || 'Failed to delete donor.');
      return;
    }

    alert('Donor deleted successfully.');
    await loadDonors();
  } catch (error) {
    console.error('Delete donor error:', error);
    alert('Could not connect to Flask backend.');
  }
};


  return (
    <>


      {/* ===================================================
          PAGE HEADER
      =================================================== */}

      <section className="module-header">

        <div>

          <div className="eyebrow">

            <Users size={14} />

            MODULE

          </div>


          <h1>
            Donor Management
          </h1>


          <p>
            Register and maintain donor identity,
            medical and eligibility records.
          </p>

        </div>


        <button
          className="primary-btn"

          onClick={() =>
            setShowForm(!showForm)
          }
        >

          <Plus size={17} />

          {showForm
            ? 'Close'
            : 'Add New'}

        </button>

      </section>


      {/* ===================================================
          ADD DONOR FORM
      =================================================== */}

      {showForm && (

        <section className="panel donor-form-panel">

          <div className="panel-head">

            <div>

              <span className="section-kicker">
                NEW DONOR
              </span>

              <h2>
                Register Donor
              </h2>

            </div>

          </div>


          <form
            className="donor-form"
            onSubmit={handleSubmit}
          >


            {/* FULL NAME */}

            <input
              name="full_name"
              placeholder="Full Name"
              value={form.full_name}
              onChange={handleChange}
              required
            />


            {/* DATE OF BIRTH */}

            <input
              type="date"
              name="date_of_birth"
              value={form.date_of_birth}
              onChange={handleChange}
              required
            />


            {/* GENDER */}

            <select
              name="gender"
              value={form.gender}
              onChange={handleChange}
              required
            >

              <option value="">
                Select Gender
              </option>

              <option value="Male">
                Male
              </option>

              <option value="Female">
                Female
              </option>

              <option value="Other">
                Other
              </option>

            </select>


            {/* BLOOD GROUP */}

            <select
              name="blood_group"
              value={form.blood_group}
              onChange={handleChange}
              required
            >

              <option value="">
                Blood Group
              </option>

              <option value="A">
                A
              </option>

              <option value="B">
                B
              </option>

              <option value="AB">
                AB
              </option>

              <option value="O">
                O
              </option>

            </select>


            {/* RH FACTOR */}

            <select
              name="rh_factor"
              value={form.rh_factor}
              onChange={handleChange}
              required
            >

              <option value="">
                Rh Factor
              </option>

              <option value="+">
                +
              </option>

              <option value="-">
                -
              </option>

            </select>


            {/* PHONE */}

            <input
              name="phone"
              placeholder="Phone"
              value={form.phone}
              onChange={handleChange}
              required
            />


            {/* EMAIL */}

            <input
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              required
            />


            {/* MEDICAL NOTES */}

            <textarea
              name="medical_notes"
              placeholder="Medical Notes"
              value={form.medical_notes}
              onChange={handleChange}
            />
            {/* ELIGIBILITY STATUS */}
            <select
            name="eligibility_status"  
            value={form.eligibility_status}
            onChange={handleChange} 
            required> <option value="Eligible">   
            Eligible
            </option>
            <option value="Not Eligible">
              Not Eligible
              </option></select>


            {/* BUTTONS */}

            <div className="form-actions">

              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  setShowForm(false)
                }
              >
                Cancel
              </button>


              <button
                type="submit"
                className="primary-btn"
                disabled={loading}
              >

                {loading
                  ? 'Saving...'
                  : 'Register Donor'}

              </button>

            </div>

          </form>

        </section>

      )}


      {/* ===================================================
          DONOR DATABASE
      =================================================== */}

      <section className="panel donor-list-panel">

        <div className="panel-head">

          <div>

            <span className="section-kicker">
              DATABASE
            </span>

            <h2>
              Registered Donors
            </h2>

          </div>


          <button
            className="text-btn"
            onClick={loadDonors}
          >

            Refresh

          </button>

        </div>


        {donors.length === 0 ? (

          <div className="empty-state">

            <div className="empty-icon">

              <Users size={28} />

            </div>


            <h2>
              No donors loaded
            </h2>


            <p>
              Click Refresh to load donor
              records from MySQL.
            </p>

          </div>

        ) : (

          <div className="table-wrap">

            <table>

              <thead>

                <tr>

                  <th>
                    ID
                  </th>

                  <th>
                    Name
                  </th>

                  <th>
                    Date of Birth
                  </th>

                  <th>
                    Gender
                  </th>

                  <th>
                    Blood Group
                  </th>

                  <th>
                    Rh
                  </th>

                  <th>
                    Phone
                  </th>

                  <th>
                    Email
                  </th>

                  <th>
                    Status
                  </th>

                </tr>

              </thead>


              <tbody>

                {donors.map(donor => (

                  <tr
                    key={donor.donor_id}
                  >

                    <td>
                      {donor.donor_id}
                    </td>


                    <td>

                      <strong>
                        {donor.full_name}
                      </strong>

                    </td>


                    <td>
                      {donor.date_of_birth}
                    </td>


                    <td>
                      {donor.gender}
                    </td>


                    <td>
                      {donor.blood_group}
                    </td>


                    <td>
                      {donor.rh_factor}
                    </td>


                    <td>
                      {donor.phone}
                    </td>


                    <td>
                      {donor.email}
                    </td>


                    <td>

                      <span className="status green">

                        {donor.eligibility_status ||
                          'Eligible'}

                      </span>

                    </td>


{isAdmin && (
  <td>
    <button
      className="secondary-btn"
      onClick={() => handleDeleteDonor(donor.donor_id)}
      style={{
        color: '#dc2626',
        borderColor: '#fecaca'
      }}
    >
      Delete
    </button>
  </td>
)}


                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </section>

    </>
  );
}


/* =========================================================
   OTHER MODULE PAGES
========================================================= */
function RecipientsPage({ isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    hospital_id: 1,
    full_name: '',
    date_of_birth: '',
    gender: '',
    blood_group: '',
    rh_factor: '',
    hla_profile: '',
    clinical_urgency: 'Medium',
    medical_notes: '',
    eligibility_status: 'Pending'
  });

  const fetchRecipients = async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/recipients');

      const data = await response.json();

      if (data.success) {
        setRecipients(data.recipients);
      } else {
        alert(data.error || 'Failed to load recipients');
      }
    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipients();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await apiFetch('/api/recipients', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(form)
});

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to register recipient');
        return;
      }

      alert('Recipient registered successfully!');

      setForm({
        hospital_id: 1,
        full_name: '',
        date_of_birth: '',
        gender: '',
        blood_group: '',
        rh_factor: '',
        hla_profile: '',
        clinical_urgency: 'Medium',
        medical_notes: '',
        eligibility_status: 'Pending'
      });

      setShowForm(false);

      fetchRecipients();

    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server.');
    }
  };


const handleDeleteRecipient = async (recipientId) => {
  if (!window.confirm(
    `Delete recipient #${recipientId}? This action cannot be undone.`
  )) {
    return;
  }

  try {
    const response = await apiFetch(
      `/api/recipients/${recipientId}`,
      { method: 'DELETE' }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      alert(data.error || 'Failed to delete recipient.');
      return;
    }

    alert('Recipient deleted successfully.');
    await fetchRecipients();
  } catch (error) {
    console.error('Delete recipient error:', error);
    alert('Could not connect to Flask backend.');
  }
};

  

  return (
    <>
      <section className="module-header">
        <div>
          <div className="eyebrow">
            <Stethoscope size={14} />
            MODULE
          </div>

          <h1>Recipient Management</h1>

          <p>
            Maintain recipient profiles, transplant history and eligibility details.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setShowForm(true)}
        >
          <Plus size={17} />
          Add New
        </button>
      </section>

      {showForm && (
        <section className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-head">
            <div>
              <span className="section-kicker">NEW RECIPIENT</span>
              <h2>Register Recipient</h2>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '15px',
              padding: '20px'
            }}
          >
            <input
              type="text"
              name="full_name"
              placeholder="Full Name"
              value={form.full_name}
              onChange={handleChange}
              required
            />

            <input
              type="date"
              name="date_of_birth"
              value={form.date_of_birth}
              onChange={handleChange}
              required
            />

            <select
              name="gender"
              value={form.gender}
              onChange={handleChange}
              required
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>

            <select
              name="blood_group"
              value={form.blood_group}
              onChange={handleChange}
              required
            >
              <option value="">Blood Group</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
              <option value="O">O</option>
            </select>

            <select
              name="rh_factor"
              value={form.rh_factor}
              onChange={handleChange}
              required
            >
              <option value="">Rh Factor</option>
              <option value="+">+</option>
              <option value="-">-</option>
            </select>

            <input
              type="text"
              name="hla_profile"
              placeholder="HLA Profile"
              value={form.hla_profile}
              onChange={handleChange}
            />

            <select
              name="clinical_urgency"
              value={form.clinical_urgency}
              onChange={handleChange}
              required
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>

            <select
              name="eligibility_status"
              value={form.eligibility_status}
              onChange={handleChange}
              required
            >
              <option value="Pending">Pending</option>
              <option value="Eligible">Eligible</option>
              <option value="Not Eligible">Not Eligible</option>
            </select>

            <textarea
              name="medical_notes"
              placeholder="Medical Notes"
              value={form.medical_notes}
              onChange={handleChange}
              style={{ gridColumn: 'span 3' }}
            />

            <div
              style={{
                gridColumn: 'span 3',
                display: 'flex',
                gap: '10px'
              }}
            >
              <button
                type="submit"
                className="primary-btn"
              >
                Save Recipient
              </button>

              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">DATABASE</span>
            <h2>Registered Recipients</h2>
          </div>

          <button
            className="text-btn"
            onClick={fetchRecipients}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '30px' }}>
            Loading recipients...
          </div>
        ) : recipients.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            No recipients registered yet.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Date of Birth</th>
                  <th>Gender</th>
                  <th>Blood Group</th>
                  <th>Rh</th>
                  <th>Urgency</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {recipients.map(recipient => (
                  <tr key={recipient.recipient_id}>
                    <td>{recipient.recipient_id}</td>
                    <td><strong>{recipient.full_name}</strong></td>
                    <td>{recipient.date_of_birth}</td>
                    <td>{recipient.gender}</td>
                    <td>{recipient.blood_group}</td>
                    <td>{recipient.rh_factor}</td>
                    <td>{recipient.clinical_urgency}</td>
                    <td>
                      <span className="status green">
                        {recipient.eligibility_status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className="secondary-btn"
                          onClick={() => handleDeleteRecipient(recipient.recipient_id)}
                          style={{ color: '#dc2626', borderColor: '#fecaca' }}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RequestsPage({ isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [requests, setRequests] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    hospital_id: 1,
    recipient_id: "",
    request_type: "Blood",
    requested_blood_group: "A",
    requested_rh_factor: "+",
    requested_organ_type: "",
    quantity: 1,
    urgency: "Medium",
    status: "Pending"
  });

  const fetchRequests = async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/requests');

      const data = await response.json();

      if (data.success) {
        setRequests(data.requests);
      } else {
        alert(data.error || "Failed to load requests");
      }

    } catch (error) {
      alert("Could not connect to Flask server.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  const fetchRecipients = async () => {
  try {
    const response = await apiFetch('/api/recipients');

    const data = await response.json();

    if (data.success) {
      setRecipients(data.recipients);
    } else {
      alert(data.error || "Failed to load recipients");
    }

  } catch (error) {
    console.error(error);
    alert("Could not connect to recipients API.");
  }
};

  const handleDeleteRequest = async (requestId) => {
    if (!window.confirm(`Delete request #${requestId}? This action cannot be undone.`)) return;
    try {
      const response = await apiFetch(`/api/requests/${requestId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to delete request.');
        return;
      }
      alert('Request deleted successfully.');
      await fetchRequests();
    } catch (error) {
      console.error('Delete request error:', error);
      alert('Could not connect to Flask backend.');
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchRecipients();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleRequestTypeChange = (e) => {
    const value = e.target.value;

    setForm(prev => ({
      ...prev,
      request_type: value,
      requested_blood_group:
        value === "Blood" ? "A" : "",
      requested_rh_factor:
        value === "Blood" ? "+" : "",
      requested_organ_type:
        value === "Organ" ? "Kidney" : ""
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        hospital_id: Number(form.hospital_id),
        recipient_id: Number(form.recipient_id),
        request_type: form.request_type,

        requested_blood_group:
          form.request_type === "Blood"
            ? form.requested_blood_group
            : null,

        requested_rh_factor:
          form.request_type === "Blood"
            ? form.requested_rh_factor
            : null,

        requested_organ_type:
          form.request_type === "Organ"
            ? form.requested_organ_type
            : null,

        quantity: Number(form.quantity),
        urgency: form.urgency,
        status: form.status
      };

      const response = await apiFetch('/api/requests', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || "Failed to create request");
        return;
      }

      alert("Request created successfully!");

      setShowForm(false);

      setForm({
        hospital_id: 1,
        recipient_id: 1,
        request_type: "Blood",
        requested_blood_group: "A",
        requested_rh_factor: "+",
        requested_organ_type: "",
        quantity: 1,
        urgency: "Medium",
        status: "Pending"
      });

      fetchRequests();

    } catch (error) {
      console.error(error);
      alert("Could not connect to Flask server.");
    }
  };

  return (
    <>
      <section className="module-header">
        <div>
          <div className="eyebrow">
            <ClipboardList size={14} />
            REQUEST MANAGEMENT
          </div>

          <h1>Request Management</h1>

          <p>
            Create and track blood or organ requests from hospital branches.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={17} />
          {showForm ? "Close Form" : "Add Request"}
        </button>
      </section>

      {showForm && (
        <section className="panel module-panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">
                NEW REQUEST
              </span>

              <h2>Create Request</h2>
            </div>
          </div>

          <form className="request-form" onSubmit={handleSubmit}>

            <input
              type="number"
              name="hospital_id"
              placeholder="Hospital ID"
              value={form.hospital_id}
              onChange={handleChange}
              required
            />

            <select
            name="recipient_id"
             value={form.recipient_id}
             onChange={handleChange}
             required
             >
              <option value="">
                 Select Recipient
                 </option>
                 {recipients.map(recipient => (
                  <option
                  key={recipient.recipient_id}
                  value={recipient.recipient_id}
                  >
                    #{recipient.recipient_id} - {recipient.full_name}
                    </option>
                  ))}
                  </select>

            <select
              name="request_type"
              value={form.request_type}
              onChange={handleRequestTypeChange}
              required
            >
              <option value="Blood">Blood</option>
              <option value="Organ">Organ</option>
            </select>

            {form.request_type === "Blood" && (
              <>
                <select
                  name="requested_blood_group"
                  value={form.requested_blood_group}
                  onChange={handleChange}
                  required
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="AB">AB</option>
                  <option value="O">O</option>
                </select>

                <select
                  name="requested_rh_factor"
                  value={form.requested_rh_factor}
                  onChange={handleChange}
                  required
                >
                  <option value="+">+</option>
                  <option value="-">-</option>
                </select>
              </>
            )}

            {form.request_type === "Organ" && (
              <select
                name="requested_organ_type"
                value={form.requested_organ_type}
                onChange={handleChange}
                required
              >
                <option value="Kidney">Kidney</option>
                <option value="Liver">Liver</option>
                <option value="Heart">Heart</option>
                <option value="Lung">Lung</option>
                <option value="Pancreas">Pancreas</option>
              </select>
            )}

            <input
              type="number"
              name="quantity"
              min="1"
              value={form.quantity}
              onChange={handleChange}
              placeholder="Quantity"
              required
            />

            <select
              name="urgency"
              value={form.urgency}
              onChange={handleChange}
              required
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>

            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              required
            >
              <option value="Pending">Pending</option>
              <option value="Matched">Matched</option>
              <option value="Reserved">Reserved</option>
              <option value="Allocated">Allocated</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-btn"
              >
                <Plus size={17} />
                Save Request
              </button>
            </div>

          </form>
        </section>
      )}

      <section className="panel module-panel">

        <div className="panel-head">
          <div>
            <span className="section-kicker">
              DATABASE
            </span>

            <h2>Registered Requests</h2>
          </div>

          <button
            className="text-btn"
            onClick={fetchRequests}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <ClipboardList size={28} />
            </div>

            <h2>No requests registered yet</h2>

            <p>
              Create a blood or organ request using the Add Request button.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>RECIPIENT</th>
                  <th>TYPE</th>
                  <th>REQUEST</th>
                  <th>QUANTITY</th>
                  <th>URGENCY</th>
                  <th>STATUS</th>
                </tr>
              </thead>

              <tbody>
                {requests.map(request => (
                  <tr key={request.request_id}>

                    <td>
                      {request.request_id}
                    </td>

                    <td>
                      #{request.recipient_id}
                    </td>

                    <td>
                      <span className="type-pill">
                        {request.request_type}
                      </span>
                    </td>

                    <td>
                      {request.request_type === "Blood"
                        ? `${request.requested_blood_group}${request.requested_rh_factor}`
                        : request.requested_organ_type}
                    </td>

                    <td>
                      {request.quantity}
                    </td>

                    <td>
                      <span className={`status ${request.urgency?.toLowerCase()}`}>
                        {request.urgency}
                      </span>
                    </td>

                    <td>
                      <span className="status">
                        {request.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className="secondary-btn"
                          onClick={() => handleDeleteRequest(request.request_id)}
                          style={{ color: '#dc2626', borderColor: '#fecaca' }}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </section>
    </>
  );
}

function ModulePage({ active }) {

  const info = {

    recipients: [
      'Recipient Management',
      'Maintain recipient profiles, transplant history and eligibility details.',
      Stethoscope
    ],

    blood: [
      'Blood Inventory',
      'Track ABO, Rh, collection date, expiry and availability across branches.',
      Droplets
    ],

    organs: [
      'Organ Inventory',
      'Track organ type, HLA profile, donor information and viability windows.',
      HeartPulse
    ],

    requests: [
      'Request Management',
      'Create and track blood or organ requests from hospital branches.',
      ClipboardList
    ],

    matching: [
      'Compatibility Matching',
      'Apply compatibility rules and rank eligible organ candidates.',
      ShieldCheck
    ],

    hospitals: [
      'Hospitals / Branches',
      'View the shared multi-branch inventory and request network.',
      Building2
    ],

    allocation: [
      'Allocation & Reservation',
      'Reserve selected inventory safely and preserve allocation history.',
      Package
    ],

    audit: [
      'Audit History',
      'Review allocation outcomes, matches and status changes for traceability.',
      History
    ]

  }[active];


  const Icon = info[2];


  return (
    <>

      <section className="module-header">

        <div>

          <div className="eyebrow">

            <Icon size={14} />

            MODULE

          </div>


          <h1>
            {info[0]}
          </h1>


          <p>
            {info[1]}
          </p>

        </div>


        <button className="primary-btn">

          <Plus size={17} />

          Add New

        </button>

      </section>


      <section className="panel module-panel">

        <div className="empty-state">

          <div className="empty-icon">

            <Icon size={28} />

          </div>


          <h2>
            {info[0]} workspace
          </h2>


          <p>
            The frontend shell is ready.
            This module will be connected to
            the Flask API and MySQL database
            in the next phase.
          </p>


          <div className="roadmap">

            <span>

              <Database size={15} />

              MySQL

            </span>


            <span>

              <GitBranch size={15} />

              Flask API

            </span>


            <span>

              <Activity size={15} />

              Matching Logic

            </span>

          </div>

        </div>

      </section>

    </>
  );
}

function HospitalsPage({ isAdmin }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHospitalForm, setShowHospitalForm] = useState(false);
  const [savingHospital, setSavingHospital] = useState(false);
  const [hospitalForm, setHospitalForm] = useState({
    hospital_name: '',
    branch_name: '',
    address: '',
    city: '',
    state: '',
    contact_number: '',
    email: ''
  });

  const fetchHospitals = async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/hospitals');

      const data = await response.json();

      if (data.success) {
        setHospitals(data.hospitals || []);
      } else {
        alert(data.error || 'Failed to load hospitals');
      }
    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, []);

  const handleHospitalFormChange = (event) => {
    const { name, value } = event.target;
    setHospitalForm(previous => ({ ...previous, [name]: value }));
  };

  const handleAddHospital = async (event) => {
    event.preventDefault();
    setSavingHospital(true);
    try {
      const response = await apiFetch('/api/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hospitalForm)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to add hospital.');
        return;
      }
      alert('Hospital branch added successfully.');
      setHospitalForm({ hospital_name: '', branch_name: '', address: '', city: '', state: '', contact_number: '', email: '' });
      setShowHospitalForm(false);
      await fetchHospitals();
    } catch (error) {
      console.error('Add hospital error:', error);
      alert('Could not connect to Flask backend.');
    } finally {
      setSavingHospital(false);
    }
  };

  const handleDeleteHospital = async (hospitalId) => {
    if (!window.confirm(`Delete hospital #${hospitalId}? This action cannot be undone.`)) return;
    try {
      const response = await apiFetch(`/api/hospitals/${hospitalId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to delete hospital.');
        return;
      }
      alert('Hospital deleted successfully.');
      await fetchHospitals();
    } catch (error) {
      console.error('Delete hospital error:', error);
      alert('Could not connect to Flask backend.');
    }
  };

  return (
    <>
      <section className="module-header">
        <div>
          <div className="eyebrow">
            <Building2 size={14} />
            HOSPITAL NETWORK
          </div>

          <h1>Hospitals / Branches</h1>

          <p>
            View hospitals and their branches connected to the
            blood and organ management network.
          </p>
        </div>
        {isAdmin && (
          <button className="primary-btn" onClick={() => setShowHospitalForm(value => !value)}>
            <Plus size={17} />
            {showHospitalForm ? 'Close Form' : 'Add Hospital'}
          </button>
        )}
      </section>

      {isAdmin && showHospitalForm && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head"><div><span className="section-kicker">NEW BRANCH</span><h2>Add Hospital / Branch</h2></div></div>
          <form className="donor-form" onSubmit={handleAddHospital}>
            <input name="hospital_name" placeholder="Hospital Name" value={hospitalForm.hospital_name} onChange={handleHospitalFormChange} required />
            <input name="branch_name" placeholder="Branch Name" value={hospitalForm.branch_name} onChange={handleHospitalFormChange} required />
            <input name="address" placeholder="Address (optional)" value={hospitalForm.address} onChange={handleHospitalFormChange} />
            <input name="city" placeholder="City" value={hospitalForm.city} onChange={handleHospitalFormChange} required />
            <input name="state" placeholder="State" value={hospitalForm.state} onChange={handleHospitalFormChange} />
            <input name="contact_number" placeholder="Contact Number" value={hospitalForm.contact_number} onChange={handleHospitalFormChange} />
            <input name="email" type="email" placeholder="Email (optional)" value={hospitalForm.email} onChange={handleHospitalFormChange} />
            <div className="form-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowHospitalForm(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={savingHospital}>{savingHospital ? 'Saving...' : 'Add Hospital'}</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">

        <div className="panel-head">

          <div>
            <span className="section-kicker">
              DATABASE
            </span>

            <h2>
              Hospital Branches
            </h2>
          </div>

          <button
            className="text-btn"
            onClick={fetchHospitals}
          >
            Refresh
          </button>

        </div>

        <div className="table-wrap">

          {loading && hospitals.length === 0 ? (

            <div className="empty-state">
              <p>Loading hospitals...</p>
            </div>

          ) : hospitals.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <Building2 size={28} />
              </div>

              <h2>
                No hospitals found
              </h2>

              <p>
                Hospital branches will appear here once they
                are registered.
              </p>

            </div>

          ) : (

            <table>

              <thead>

                <tr>
                  <th>ID</th>
                  <th>HOSPITAL</th>
                  <th>BRANCH</th>
                  <th>CITY</th>
                  <th>STATE</th>
                  <th>CONTACT</th>
                  <th>EMAIL</th>
                  {isAdmin && <th>Actions</th>}
                </tr>

              </thead>

              <tbody>

                {hospitals.map(hospital => (

                  <tr key={hospital.hospital_id}>

                    <td>
                      <strong>
                        #{hospital.hospital_id}
                      </strong>
                    </td>

                    <td>
                      {hospital.hospital_name}
                    </td>

                    <td>
                      {hospital.branch_name}
                    </td>

                    <td>
                      {hospital.city}
                    </td>

                    <td>
                      {hospital.state}
                    </td>

                    <td>
                      {hospital.contact_number}
                    </td>

                    <td>
                      {hospital.email}
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className="secondary-btn"
                          onClick={() => handleDeleteHospital(hospital.hospital_id)}
                          style={{ color: '#dc2626', borderColor: '#fecaca' }}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>

                ))}

              </tbody>

            </table>

          )}

        </div>

      </section>
    </>
  );
}

function AuditHistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAuditHistory = async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/audit-history');

      const data = await response.json();

      if (data.success) {
        setHistory(data.history || []);
      } else {
        alert(data.error || 'Failed to load audit history');
      }
    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditHistory();
  }, []);

  return (
    <>
      <section className="module-header">
        <div>
          <div className="eyebrow">
            <History size={14} />
            AUDIT & TRACEABILITY
          </div>

          <h1>Audit History</h1>

          <p>
            Review matching and allocation activity across the
            blood and organ management network.
          </p>
        </div>
      </section>

      <section className="panel">

        <div className="panel-head">

          <div>
            <span className="section-kicker">
              ACTIVITY LOG
            </span>

            <h2>
              System History
            </h2>
          </div>

          <button
            className="text-btn"
            onClick={fetchAuditHistory}
          >
            Refresh
          </button>

        </div>

        <div className="table-wrap">

          {loading && history.length === 0 ? (

            <div className="empty-state">
              <p>Loading audit history...</p>
            </div>

          ) : history.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <History size={28} />
              </div>

              <h2>
                No history found
              </h2>

              <p>
                Matching and allocation events will appear here
                as the system is used.
              </p>

            </div>

          ) : (

            <table>

              <thead>

                <tr>
                  <th>TIME</th>
                  <th>EVENT</th>
                  <th>ID</th>
                  <th>REQUEST</th>
                  <th>MATCH</th>
                  <th>INVENTORY</th>
                  <th>HOSPITAL</th>
                  <th>STATUS</th>
                </tr>

              </thead>

              <tbody>

                {history.map((event, index) => {

                  const inventory = event.blood_unit_id !== null
                    ? `Blood #${event.blood_unit_id}`
                    : event.organ_id !== null
                      ? `Organ #${event.organ_id}`
                      : '-';

                  return (
                    <tr key={`${event.event_type}-${event.event_id}-${index}`}>

                      <td>
                        {event.event_time
                          ? new Date(event.event_time).toLocaleString()
                          : '-'}
                      </td>

                      <td>
                        <span className="type-pill">
                          {event.event_type}
                        </span>
                      </td>

                      <td>
                        <strong>
                          #{event.event_id}
                        </strong>
                      </td>

                      <td>
                        #{event.request_id}
                      </td>

                      <td>
                        #{event.match_id}
                      </td>

                      <td>
                        {inventory}
                      </td>

                      <td>
                        {event.hospital_id
                          ? `#${event.hospital_id}`
                          : '-'}
                      </td>

                      <td>
                        <span
                          className={
                            event.status === 'Reserved'
                              ? 'status good'
                              : 'status'
                          }
                        >
                          {event.status}
                        </span>
                      </td>

                    </tr>
                  );
                })}

              </tbody>

            </table>

          )}

        </div>

      </section>
    </>
  );
}

function AllocationPage() {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAllocations = async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/allocations');

      const data = await response.json();

      if (data.success) {
        setAllocations(data.allocations);
      } else {
        alert(data.error || 'Failed to load allocations');
      }

    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, []);

  return (
    <>
      <section className="module-header">
        <div>
          <div className="eyebrow">
            <Package size={14} />
            ALLOCATION
          </div>

          <h1>Allocation & Reservation</h1>

          <p>
            View reserved blood units and organs and track
            allocation records across the hospital network.
          </p>
        </div>
      </section>

      <section className="panel">

        <div className="panel-head">
          <div>
            <span className="section-kicker">
              DATABASE
            </span>

            <h2>Allocation Records</h2>
          </div>

          <button
            className="text-btn"
            onClick={fetchAllocations}
          >
            Refresh
          </button>
        </div>

        <div className="table-wrap">

          {loading && allocations.length === 0 ? (

            <div className="empty-state">
              <p>Loading allocation records...</p>
            </div>

          ) : allocations.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <Package size={28} />
              </div>

              <h2>No allocations found</h2>

              <p>
                Allocation records will appear here after
                a blood unit or organ is reserved.
              </p>

            </div>

          ) : (

            <table>

              <thead>
                <tr>
                  <th>ID</th>
                  <th>TYPE</th>
                  <th>REQUEST</th>
                  <th>MATCH</th>
                  <th>INVENTORY ID</th>
                  <th>HOSPITAL</th>
                  <th>STATUS</th>
                  <th>ALLOCATED AT</th>
                </tr>
              </thead>

              <tbody>

                {allocations.map(allocation => {

                  const isBlood =
                    allocation.blood_unit_id !== null;

                  return (
                    <tr key={allocation.allocation_id}>

                      <td>
                        <strong>
                          #{allocation.allocation_id}
                        </strong>
                      </td>

                      <td>
                        <span className="type-pill">
                          {isBlood ? 'Blood' : 'Organ'}
                        </span>
                      </td>

                      <td>
                        #{allocation.request_id}
                      </td>

                      <td>
                        #{allocation.match_id}
                      </td>

                      <td>
                        {isBlood
                          ? `Blood #${allocation.blood_unit_id}`
                          : `Organ #${allocation.organ_id}`}
                      </td>

                      <td>
                        {allocation.hospital_id}
                      </td>

                      <td>
                        <span className="status good">
                          {allocation.allocation_status}
                        </span>
                      </td>

                      <td>
                        {allocation.allocated_at
                          ? new Date(
                              allocation.allocated_at
                            ).toLocaleString()
                          : '-'}
                      </td>

                    </tr>
                  );
                })}

              </tbody>

            </table>

          )}

        </div>

      </section>
    </>
  );
}

function BloodInventoryPage({ isAdmin }) {
  const [bloodUnits, setBloodUnits] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    donor_id: '',
    hospital_id: 1,
    blood_group: '',
    rh_factor: '',
    collection_date: '',
    expiry_date: '',
    status: 'Available'
  });

  const fetchBloodUnits = async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/blood-units');

      const data = await response.json();

      if (data.success) {
        setBloodUnits(data.blood_units);
      } else {
        alert(data.error || 'Failed to load blood units');
      }

    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBloodUnits();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const response = await apiFetch('/api/blood-units', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    donor_id: Number(form.donor_id),
    hospital_id: Number(form.hospital_id),
    blood_group: form.blood_group,
    rh_factor: form.rh_factor,
    collection_date: form.collection_date,
    expiry_date: form.expiry_date,
    status: form.status
  })
});

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to add blood unit');
        return;
      }

      alert('Blood unit added successfully!');

      setForm({
        donor_id: '',
        hospital_id: 1,
        blood_group: '',
        rh_factor: '',
        collection_date: '',
        expiry_date: '',
        status: 'Available'
      });

      setShowForm(false);

      fetchBloodUnits();

    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server');
    } finally {
      setLoading(false);
    }
  };

const handleDeleteBloodUnit = async (bloodUnitId) => {
  if (!window.confirm(
    `Delete blood unit #${bloodUnitId}? This action cannot be undone.`
  )) {
    return;
  }

  try {
    const response = await apiFetch(
      `/api/blood-units/${bloodUnitId}`,
      { method: 'DELETE' }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      alert(data.error || 'Failed to delete blood unit.');
      return;
    }

    alert('Blood unit deleted successfully.');
    await fetchBloodUnits();
  } catch (error) {
    console.error('Delete blood unit error:', error);
    alert('Could not connect to Flask backend.');
  }
};

  return (
    <>
      <section className="module-header">
        <div>
          <div className="eyebrow">
            <Droplets size={14} />
            BLOOD INVENTORY
          </div>

          <h1>Blood Inventory</h1>

          <p>
            Track blood units, collection dates, expiry dates and availability
            across hospital branches.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={17} />
          Add Blood Unit
        </button>
      </section>


      {showForm && (
        <section className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-head">
            <div>
              <span className="section-kicker">NEW BLOOD UNIT</span>
              <h2>Register Blood Unit</h2>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '15px',
              padding: '20px'
            }}
          >

            <input
              type="number"
              name="donor_id"
              placeholder="Donor ID"
              value={form.donor_id}
              onChange={handleChange}
              required
            />

            <input
              type="number"
              name="hospital_id"
              placeholder="Hospital ID"
              value={form.hospital_id}
              onChange={handleChange}
              required
            />

            <select
              name="blood_group"
              value={form.blood_group}
              onChange={handleChange}
              required
            >
              <option value="">Blood Group</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
              <option value="O">O</option>
            </select>

            <select
              name="rh_factor"
              value={form.rh_factor}
              onChange={handleChange}
              required
            >
              <option value="">Rh Factor</option>
              <option value="+">Positive (+)</option>
              <option value="-">Negative (-)</option>
            </select>

            <input
              type="date"
              name="collection_date"
              value={form.collection_date}
              onChange={handleChange}
              required
            />

            <input
              type="date"
              name="expiry_date"
              value={form.expiry_date}
              onChange={handleChange}
              required
            />

            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              required
            >
              <option value="Available">Available</option>
              <option value="Reserved">Reserved</option>
              <option value="Allocated">Allocated</option>
              <option value="Expired">Expired</option>
              <option value="Unavailable">Unavailable</option>
            </select>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center'
              }}
            >
              <button
                type="submit"
                className="primary-btn"
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Blood Unit'}
              </button>

              <button
                type="button"
                className="text-btn"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>

          </form>
        </section>
      )}


      <section className="panel">

        <div className="panel-head">
          <div>
            <span className="section-kicker">DATABASE</span>
            <h2>Blood Units</h2>
          </div>

          <button
            className="text-btn"
            onClick={fetchBloodUnits}
          >
            Refresh
          </button>
        </div>


        <div className="table-wrap">

          {loading && bloodUnits.length === 0 ? (
            <div className="empty-state">
              <p>Loading blood inventory...</p>
            </div>
          ) : bloodUnits.length === 0 ? (

            <div className="empty-state">
              <div className="empty-icon">
                <Droplets size={28} />
              </div>

              <h2>No blood units registered yet</h2>

              <p>
                Add your first blood unit using the button above.
              </p>
            </div>

          ) : (

            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>DONOR ID</th>
                  <th>HOSPITAL</th>
                  <th>BLOOD GROUP</th>
                  <th>RH</th>
                  <th>COLLECTION</th>
                  <th>EXPIRY</th>
                  <th>STATUS</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>

                {bloodUnits.map(unit => (
                  <tr key={unit.blood_unit_id}>

                    <td>
                      <strong>
                        {unit.blood_unit_id}
                      </strong>
                    </td>

                    <td>
                      {unit.donor_id}
                    </td>

                    <td>
                      {unit.hospital_id}
                    </td>

                    <td>
                      <span className="type-pill blood">
                        {unit.blood_group}
                      </span>
                    </td>

                    <td>
                      {unit.rh_factor}
                    </td>

                    <td>
                      {unit.collection_date
                        ? new Date(
                            unit.collection_date
                          ).toLocaleDateString()
                        : '-'}
                    </td>

                    <td>
                      {unit.expiry_date
                        ? new Date(
                            unit.expiry_date
                          ).toLocaleDateString()
                        : '-'}
                    </td>

                    <td>
                      <span className="status good">
                        {unit.status}
                      </span>
                    </td>

                    {isAdmin && (
                      <td>
                        <button
                          className="secondary-btn"
                          onClick={() =>
                            handleDeleteBloodUnit(unit.blood_unit_id)
                          }
                          style={{
                            color: '#dc2626',
                            borderColor: '#fecaca'
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    )}


                  </tr>
                ))}

              </tbody>
            </table>

          )}

        </div>

      </section>
    </>
  );
}


function OrganInventoryPage({ isAdmin }) {
  const [organs, setOrgans] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    donor_id: '',
    hospital_id: 1,
    organ_type: '',
    blood_group: '',
    rh_factor: '',
    hla_profile: '',
    donor_age: '',
    collection_datetime: '',
    viability_until: '',
    status: 'Available'
  });

  const fetchOrgans = async () => {
    try {
      setLoading(true);

      const response = await apiFetch('/api/organs');

      const data = await response.json();

      if (data.success) {
        setOrgans(data.organs);
      } else {
        alert(data.error || 'Failed to load organs');
      }

    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgans();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const response = await apiFetch('/api/organs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    donor_id: Number(form.donor_id),
    hospital_id: Number(form.hospital_id),
    organ_type: form.organ_type,
    blood_group: form.blood_group,
    rh_factor: form.rh_factor,
    hla_profile: form.hla_profile,
    donor_age: Number(form.donor_age),
    collection_datetime: form.collection_datetime,
    viability_until: form.viability_until,
    status: form.status
  })
});

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to add organ');
        return;
      }

      alert('Organ registered successfully!');

      setForm({
        donor_id: '',
        hospital_id: 1,
        organ_type: '',
        blood_group: '',
        rh_factor: '',
        hla_profile: '',
        donor_age: '',
        collection_datetime: '',
        viability_until: '',
        status: 'Available'
      });

      setShowForm(false);

      fetchOrgans();

    } catch (error) {
      console.error(error);
      alert('Could not connect to Flask server');
    } finally {
      setLoading(false);
    }
  };

const handleDeleteOrgan = async (organId) => {
  if (!window.confirm(
    `Delete organ #${organId}? This action cannot be undone.`
  )) {
    return;
  }

  try {
    const response = await apiFetch(
      `/api/organs/${organId}`,
      { method: 'DELETE' }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      alert(data.error || 'Failed to delete organ.');
      return;
    }

    alert('Organ deleted successfully.');
    await fetchOrgans();
  } catch (error) {
    console.error('Delete organ error:', error);
    alert('Could not connect to Flask backend.');
  }
};

  return (
    <>
      <section className="module-header">
        <div>
          <div className="eyebrow">
            <HeartPulse size={14} />
            ORGAN INVENTORY
          </div>

          <h1>Organ Inventory</h1>

          <p>
            Track available organs, donor information, HLA profiles
            and viability windows.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus size={17} />
          Add Organ
        </button>
      </section>


      {showForm && (
        <section
          className="panel"
          style={{ marginBottom: '20px' }}
        >
          <div className="panel-head">
            <div>
              <span className="section-kicker">
                NEW ORGAN
              </span>

              <h2>Register Organ</h2>
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '15px',
              padding: '20px'
            }}
          >

            <input
              type="number"
              name="donor_id"
              placeholder="Donor ID"
              value={form.donor_id}
              onChange={handleChange}
              required
            />

            <input
              type="number"
              name="hospital_id"
              placeholder="Hospital ID"
              value={form.hospital_id}
              onChange={handleChange}
              required
            />

            <select
              name="organ_type"
              value={form.organ_type}
              onChange={handleChange}
              required
            >
              <option value="">
                Select Organ
              </option>

              <option value="Heart">
                Heart
              </option>

              <option value="Kidney">
                Kidney
              </option>

              <option value="Liver">
                Liver
              </option>

              <option value="Lung">
                Lung
              </option>

              <option value="Pancreas">
                Pancreas
              </option>

              <option value="Cornea">
                Cornea
              </option>
            </select>


            <select
              name="blood_group"
              value={form.blood_group}
              onChange={handleChange}
              required
            >
              <option value="">
                Blood Group
              </option>

              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
              <option value="O">O</option>
            </select>


            <select
              name="rh_factor"
              value={form.rh_factor}
              onChange={handleChange}
              required
            >
              <option value="">
                Rh Factor
              </option>

              <option value="+">
                Positive (+)
              </option>

              <option value="-">
                Negative (-)
              </option>
            </select>


            <input
              type="number"
              name="donor_age"
              placeholder="Donor Age"
              value={form.donor_age}
              onChange={handleChange}
              required
            />


            <input
              type="text"
              name="hla_profile"
              placeholder="HLA Profile"
              value={form.hla_profile}
              onChange={handleChange}
            />


            <input
              type="datetime-local"
              name="collection_datetime"
              value={form.collection_datetime}
              onChange={handleChange}
              required
            />


            <input
              type="datetime-local"
              name="viability_until"
              value={form.viability_until}
              onChange={handleChange}
              required
            />


            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              required
            >
              <option value="Available">
                Available
              </option>

              <option value="Reserved">
                Reserved
              </option>

              <option value="Allocated">
                Allocated
              </option>

              <option value="Expired">
                Expired
              </option>

              <option value="Unavailable">
                Unavailable
              </option>
            </select>


            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'center'
              }}
            >

              <button
                type="submit"
                className="primary-btn"
                disabled={loading}
              >
                {loading
                  ? 'Saving...'
                  : 'Save Organ'}
              </button>

              <button
                type="button"
                className="text-btn"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

            </div>

          </form>
        </section>
      )}


      <section className="panel">

        <div className="panel-head">
          <div>
            <span className="section-kicker">
              DATABASE
            </span>

            <h2>Registered Organs</h2>
          </div>

          <button
            className="text-btn"
            onClick={fetchOrgans}
          >
            Refresh
          </button>
        </div>


        <div className="table-wrap">

          {loading && organs.length === 0 ? (

            <div className="empty-state">
              <p>Loading organ inventory...</p>
            </div>

          ) : organs.length === 0 ? (

            <div className="empty-state">

              <div className="empty-icon">
                <HeartPulse size={28} />
              </div>

              <h2>
                No organs registered yet
              </h2>

              <p>
                Add your first organ using the
                button above.
              </p>

            </div>

          ) : (

            <table>

              <thead>
                <tr>
                  <th>ID</th>
                  <th>DONOR ID</th>
                  <th>ORGAN</th>
                  <th>BLOOD</th>
                  <th>RH</th>
                  <th>HLA PROFILE</th>
                  <th>DONOR AGE</th>
                  <th>VIABILITY UNTIL</th>
                  <th>STATUS</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>

                {organs.map(organ => (

                  <tr key={organ.organ_id}>

                    <td>
                      <strong>
                        {organ.organ_id}
                      </strong>
                    </td>

                    <td>
                      {organ.donor_id}
                    </td>

                    <td>
                      <span className="type-pill organ">
                        {organ.organ_type}
                      </span>
                    </td>

                    <td>
                      {organ.blood_group}
                    </td>

                    <td>
                      {organ.rh_factor}
                    </td>

                    <td>
                      {organ.hla_profile || '-'}
                    </td>

                    <td>
                      {organ.donor_age || '-'}
                    </td>

                    <td>
                      {organ.viability_until
                        ? new Date(
                            organ.viability_until
                          ).toLocaleString()
                        : '-'}
                    </td>

                    <td>
                      <span className="status good">
                        {organ.status}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          className="secondary-btn"
                          onClick={() => handleDeleteOrgan(organ.organ_id)}
                          style={{ color: '#dc2626', borderColor: '#fecaca' }}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>

                ))}

              </tbody>

            </table>

          )}

        </div>

      </section>
    </>
  );
}

function CompatibilityPage() {
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState("");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Load requests
  const fetchRequests = async () => {
    try {
      const response = await apiFetch('/api/requests');

      const data = await response.json();

      if (data.success) {
        setRequests(data.requests);
      } else {
        setMessage(data.error || "Failed to load requests");
      }
    } catch (error) {
      setMessage("Unable to connect to Flask API");
    }
  };

  // Find compatible matches
  const findMatches = async () => {
    if (!selectedRequest) {
      setMessage("Please select a request first.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setMatches([]);

      const response = await apiFetch(
        `/api/matching/${selectedRequest}`
      );

      const data = await response.json();

      if (data.success) {
        setMatches(data.matches || []);

        if ((data.matches || []).length === 0) {
          setMessage("No compatible matches found.");
        }
      } else {
        setMessage(data.error || "Matching failed.");
      }
    } catch (error) {
      setMessage("Unable to connect to matching API.");
    } finally {
      setLoading(false);
    }
  };


  // Allocate a compatible match
  const allocateMatch = async (match) => {
    if (!selectedRequest || !match.match_id) {
      setMessage("Missing request ID or match ID.");
      return;
    }

    if (match.status !== "Available") {
      setMessage("This inventory item is not available.");
      return;
    }

    const confirmed = window.confirm(
      `Allocate ${match.type} #${match.id}?`
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setMessage("");

      const payload = {
        match_id: match.match_id,
        request_id: Number(selectedRequest),
        ...(match.type === "Blood"
          ? { blood_unit_id: match.id }
          : { organ_id: match.id }),
      };

      const response = await apiFetch("/api/allocations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Allocation failed.");
      }

      setMessage("Allocation successful!");
      await findMatches();
    } catch (error) {
      console.error("Allocation failed:", error);
      setMessage(error.message || "Allocation failed.");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchRequests();
  }, []);

  return (
    <section className="module-page">

      <div className="module-header">
        <div>
          <span className="section-kicker">
            MATCHING ENGINE
          </span>

          <h1>Compatibility Matching</h1>

          <p>
            Apply compatibility rules and find eligible blood
            and organ candidates.
          </p>
        </div>
      </div>

      <section className="panel">

        <div className="panel-head">
          <div>
            <span className="section-kicker">
              MATCH REQUEST
            </span>

            <h2>Find Compatible Candidates</h2>
          </div>
        </div>

        <div className="form-grid">

          <div className="form-field">
            <label>Select Request</label>

            <select
              value={selectedRequest}
              onChange={(e) =>
                setSelectedRequest(e.target.value)
              }
            >
              <option value="">
                -- Select a request --
              </option>

              {requests.map((request) => (
                <option
                  key={request.request_id}
                  value={request.request_id}
                >
                  Request #{request.request_id} -{" "}
                  {request.request_type} -{" "}
                  {request.urgency}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>&nbsp;</label>

            <button
              className="primary-btn"
              onClick={findMatches}
              disabled={loading}
            >
              {loading ? "Finding Matches..." : "Find Matches"}
            </button>
          </div>

        </div>

        {message && (
          <div className="notice">
            {message}
          </div>
        )}

      </section>

      {matches.length > 0 && (
        <section className="panel matches-panel">

          <div className="panel-head">
            <div>
              <span className="section-kicker">
                MATCH RESULTS
              </span>

              <h2>
                {matches.length} Compatible Candidate
                {matches.length !== 1 ? "s" : ""}
              </h2>
            </div>
          </div>

          <div className="table-wrap">

            <table>

              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Blood Group</th>
                  <th>Rh</th>
                  <th>Donor ID</th>
                  <th>Hospital ID</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>

                {matches.map((match) => (
                  <tr key={match.id}>

                    <td>#{match.id}</td>

                    <td>
                      <span className="type-pill">
                        {match.type}
                      </span>
                    </td>

                    <td>
                      {match.blood_group || "-"}
                    </td>

                    <td>
                      {match.rh_factor || "-"}
                    </td>

                    <td>
                      {match.donor_id || "-"}
                    </td>

                    <td>
                      {match.hospital_id || "-"}
                    </td>

                    <td>
  <span className="status available">
    {match.status}
  </span>
</td>

<td>
  <button
    type="button"
    className="allocate-btn"
    onClick={() => allocateMatch(match)}
    disabled={loading || match.status !== "Available"}
  >
    Allocate
  </button>
</td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>

        </section>
      )}

    </section>
  );
}

/* =========================================================
   EXPORT
========================================================= */

export default App;