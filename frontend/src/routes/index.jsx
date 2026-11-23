import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '../state/auth.js'
import BuscaPage from '../pages/BuscaPage.jsx'
import CadastroPage from '../pages/CadastroPage.jsx'
import HomePage from '../pages/HomePage.jsx'
import LoginPage from '../pages/LoginPage.jsx'
import MinhasViagensPage from '../pages/MinhasViagensPage.jsx'
import OfertaDetalhePage from '../pages/OfertaDetalhePage.jsx'
import OfertaFormPage from '../pages/OfertaFormPage.jsx'
import PerfilPage from '../pages/PerfilPage.jsx'
import RecorrenciasPage from '../pages/RecorrenciasPage.jsx'
import VeiculosPage from '../pages/VeiculosPage.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'

const PAGE_COMPONENTS = {
  BuscaPage,
  CadastroPage,
  HomePage,
  LoginPage,
  MinhasViagensPage,
  OfertaDetalhePage,
  OfertaFormPage,
  PerfilPage,
  RecorrenciasPage,
  VeiculosPage,
}

const ROUTE_DEFINITIONS = [
  { id: 'home', path: '/', title: 'Início', page: 'HomePage', nav: true },
  { id: 'login', path: '/login', title: 'Entrar', page: 'LoginPage', guest: true },
  { id: 'cadastro', path: '/cadastro', title: 'Criar conta', page: 'CadastroPage', guest: true },
  {
    id: 'busca',
    path: '/busca',
    title: 'Buscar caronas',
    page: 'BuscaPage',
    protected: true,
    nav: true,
  },
  {
    id: 'ofertaNova',
    path: '/ofertas/nova',
    title: 'Nova oferta',
    page: 'OfertaFormPage',
    protected: true,
    nav: true,
  },
  {
    id: 'ofertaDetalhe',
    path: '/ofertas/:id',
    title: 'Detalhes da oferta',
    page: 'OfertaDetalhePage',
    protected: true,
  },
  {
    id: 'veiculos',
    path: '/veiculos',
    title: 'Veículos',
    page: 'VeiculosPage',
    protected: true,
    nav: true,
  },
  {
    id: 'perfil',
    path: '/perfil',
    title: 'Perfil',
    page: 'PerfilPage',
    protected: true,
    nav: true,
  },
  {
    id: 'minhasViagens',
    path: '/minhas-viagens',
    title: 'Minhas viagens',
    page: 'MinhasViagensPage',
    protected: true,
    nav: true,
  },
  {
    id: 'recorrencias',
    path: '/recorrencias',
    title: 'Recorrências',
    page: 'RecorrenciasPage',
    protected: true,
    nav: true,
  },
]

function PagePlaceholder({ title }) {
  return (
    <section className="page-placeholder">
      <h1>{title}</h1>
      <p>Esta tela está em preparação e estará disponível em breve.</p>
    </section>
  )
}

function GuestOnlyRoute({ children, redirectTo = '/perfil' }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to={redirectTo} replace />
  return children ?? null
}

function NotFound() {
  return (
    <section className="page-not-found">
      <h1>Página não encontrada</h1>
      <p>O endereço acessado não existe.</p>
      <Link to="/">Voltar ao início</Link>
    </section>
  )
}

function buildRoutes() {
  return ROUTE_DEFINITIONS.map((definition) => {
    const Component = PAGE_COMPONENTS[definition.page]
    if (!Component) throw new Error(`Página ${definition.page} não encontrada`)

    return {
      ...definition,
      element: <Component />,
    }
  })
}

export const appRoutes = buildRoutes()

export const navigationItems = appRoutes
  .filter((route) => route.nav)
  .map((route) => ({
    id: route.id,
    to: route.path,
    label: route.title,
    protected: Boolean(route.protected),
    guest: Boolean(route.guest),
  }))

export function renderRouteElement(route) {
  const content = route.element ?? <PagePlaceholder title={route.title} />
  if (route.guest) return <GuestOnlyRoute>{content}</GuestOnlyRoute>
  if (!route.protected) return content
  return <ProtectedRoute>{content}</ProtectedRoute>
}

export function AppRoutes({ routes = appRoutes, notFound = <NotFound /> }) {
  return (
    <Routes>
      {routes.map((route) => (
        <Route key={route.id} path={route.path} element={renderRouteElement(route)} />
      ))}
      <Route path="*" element={notFound} />
    </Routes>
  )
}

export { NotFound, GuestOnlyRoute, PagePlaceholder }
export default AppRoutes
