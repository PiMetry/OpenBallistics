/** Fonts are bundled locally; Inter is loaded by shadcn.css. */
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-700.css';

import './shadcn.css';
import './app.css';
import './layout.css';
import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
