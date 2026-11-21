import { Link, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute.jsx'

const pageModules = typeof import.meta.glob === 'function'
  ? import.meta.glob('../pages/*.jsx', { eager: true })
  : {}

const ROUTE_DEFINITIONS = [
  { id: 'home', path: '/', title: 'Início', page: 'HomePage', nav: true },
  { id: 'login', path: '/login', title: 'Entrar', page: 'LoginPage' },
  { id: 'cadastro', path: '/cadastro', title: 'Criar conta', page: 'CadastroPage' },
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

function NotFound() {
  return (
    <section className="page-not-found">
      <h1>Página não encontrada</h1>
      <p>O endereço acessado não existe.</p>
      <Link to="/">Voltar ao início</Link>
    </section>
  )
}

function resolvePageComponent(page) {
  const module = pageModules[`../pages/${page}.jsx`]
  if (!module) return null

  const component = module.default || module[page]
  if (!component) throw new Error(`Página ${page} sem export padrão`)
  return component
}

function buildRoutes() {
  return ROUTE_DEFINITIONS.map((definition) => {
    const Component = resolvePageComponent(definition.page)
    return {
      ...definition,
      element: Component ? <Component /> : <PagePlaceholder title={definition.title} />,
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
  }))

export function renderRouteElement(route) {
  const content = route.element ?? <PagePlaceholder title={route.title} />
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

export { NotFound, PagePlaceholder }
export default AppRoutes
