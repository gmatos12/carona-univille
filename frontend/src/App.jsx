import { Link, NavLink } from 'react-router-dom'
import { AppRoutes, navigationItems } from './routes/index.jsx'
import { AuthProvider, useAuth } from './state/auth.js'

function Navigation() {
  const { isAuthenticated, user, logout } = useAuth()
  const items = navigationItems.filter((item) => !item.protected || isAuthenticated)

  return (
    <header className="app-header">
      <Link className="app-brand" to="/">
        Carona Univille
      </Link>

      <nav aria-label="Navegação principal">
        <ul className="app-nav-list">
          {items.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'app-nav-link active' : 'app-nav-link')}
              >
                {({ isActive }) => (
                  <span aria-current={isActive ? 'page' : undefined}>{item.label}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="app-session">
        {isAuthenticated ? (
          <>
            <span className="app-user-name">{user?.nome_completo || 'Usuário'}</span>
            <button type="button" onClick={logout}>
              Sair
            </button>
          </>
        ) : (
          <>
            <NavLink className="app-nav-link" to="/login">
              Entrar
            </NavLink>
            <NavLink className="app-nav-link" to="/cadastro">
              Criar conta
            </NavLink>
          </>
        )}
      </div>
    </header>
  )
}

export function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <a className="app-skip-link" href="#conteudo-principal">
          Pular para o conteúdo
        </a>
        <Navigation />
        <main id="conteudo-principal" tabIndex={-1}>
          <AppRoutes />
        </main>
      </div>
    </AuthProvider>
  )
}

export default App
