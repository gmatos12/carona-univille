import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <section className="auth-page">
      <div className="auth-card">
        <h1>Carona Univille</h1>
        <p>Encontre ou ofereça caronas com outros estudantes da Univille.</p>
        <p className="auth-link">
          <Link to="/busca">Buscar caronas</Link>
        </p>
        <p className="auth-link">
          <Link to="/login">Entrar</Link> ou <Link to="/cadastro">criar conta</Link>
        </p>
      </div>
    </section>
  )
}

export default HomePage
