import React from 'react';
export default class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(error){return {error};}
  componentDidCatch(error,info){console.error('HySmart UI error',error,info);}
  render(){if(!this.state.error)return this.props.children;return <div className="splash"><div className="onboard-card"><p className="eyebrow">APPLICATION ERROR</p><h1>Something went wrong</h1><p className="lead">The page hit an unexpected error. Your saved server data is not affected.</p><button className="btn primary" onClick={()=>window.location.reload()}>Reload application</button></div></div>}
}
