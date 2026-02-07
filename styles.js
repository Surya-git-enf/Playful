html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: #111;
}
#renderCanvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* simple UI */
#ui {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  grid-template-columns: repeat(2, 64px);
  grid-gap: 8px;
  z-index: 10;
}
#ui button {
  width: 64px;
  height: 64px;
  font-size: 22px;
  border-radius: 8px;
  border: none;
  background: rgba(255,255,255,0.08);
  color: #fff;
}
