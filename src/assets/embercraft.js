    let isReady = false;
    let audioCtx, masterGain, fireGain, crackleGain;

    function initAudio() {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(audioCtx.destination);

        // 화염 베이스 소리 (Pink Noise 느낌의 필터링)
        const bufferSize = audioCtx.sampleRate * 2;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }

        const noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 350;

        fireGain = audioCtx.createGain();
        fireGain.gain.value = 0;

        noiseSource.connect(filter);
        filter.connect(fireGain);
        fireGain.connect(masterGain);
        noiseSource.start();

        document.getElementById('vol-slider').addEventListener('input', (e) => {
            masterGain.gain.setTargetAtTime(e.target.value, audioCtx.currentTime, 0.1);
        });
    }

    // 1. 더 강력하고 날카로운 '탁탁' 소리 생성 함수
function playCrackle(intensity) {
    if (!audioCtx || Math.random() > intensity * 0.2) return;

    if (!crackleBuffer) createCrackleBuffer();

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = crackleBuffer;

    const g = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    // [핵심] 3000Hz 이상의 고주파만 남겨 '물소리' 같은 저음을 완전히 제거
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3500 + Math.random() * 2000, audioCtx.currentTime);
    filter.Q.value = 1; // 공명 억제 (더 건조하게)

    // [핵심] 매우 짧은 피크(0.01초)로 '타닥' 하는 충격음 구현
    const vol = (10.0 + Math.random()*2.2) * intensity;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    // 0.02초 안에 소리를 소멸시켜 잔향을 제거 (마른 소리의 핵심)
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.02);

    noiseSource.connect(filter);
    filter.connect(g);
    g.connect(masterGain);

    noiseSource.start();
    noiseSource.stop(audioCtx.currentTime + 0.03);
}
let crackleBuffer;
function createCrackleBuffer() {
    const size = audioCtx.sampleRate * 0.1; // 0.1초 분량의 노이즈
    crackleBuffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = crackleBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
        data[i] = Math.random() * 2 - 1;
    }
}
    function startSim() {
    if(isReady) return;
    document.getElementById('overlay').style.display = 'none';
    initAudio();
    createCrackleBuffer(); // 이 줄을 추가하세요
    animate();
    isReady = true;
}

    function toggleUI() { document.getElementById('main-ui').classList.toggle('hidden'); }

    const overlayEl = document.getElementById('overlay');
    const uiToggleEl = document.getElementById('ui-toggle');
    const mainUi = document.getElementById('main-ui');
    const mobileTabs = document.getElementById('mobile-panel-tabs');
    const logListEl = document.getElementById('log-list');

    function setMobilePanel(panel) {
        if (!mainUi) return;
        mainUi.classList.toggle('mobile-panel-analysis', panel === 'analysis');
        mainUi.classList.toggle('mobile-panel-inventory', panel === 'inventory');

        if (!mobileTabs) return;
        mobileTabs.querySelectorAll('button').forEach((btn) => {
            const active = btn.dataset.panel === panel;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    if (mobileTabs) {
        mobileTabs.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                setMobilePanel(btn.dataset.panel || 'analysis');
            });
        });
    }
    if (overlayEl) {
        overlayEl.addEventListener('click', startSim);
    }
    if (uiToggleEl) {
        uiToggleEl.addEventListener('click', toggleUI);
    }
    document.querySelectorAll('.inv-btn[data-log-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
            spawnLog(btn.dataset.logType);
        });
    });
    const fanBtn = document.getElementById('btn-fan');
    if (fanBtn) {
        fanBtn.addEventListener('click', fan);
    }
    const igniteBtn = document.getElementById('btn-ignite');
    if (igniteBtn) {
        igniteBtn.addEventListener('click', ignite);
    }
    if (logListEl) {
        logListEl.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('button[data-remove-id]');
            if (!removeBtn) return;
            const id = Number(removeBtn.dataset.removeId);
            if (!Number.isFinite(id)) return;
            removeLog(id);
        });
    }

    // PHYSICS
    const world = new CANNON.World(); world.gravity.set(0, -18, 0);
    const groundBody = new CANNON.Body({ mass: 0 }); groundBody.addShape(new CANNON.Box(new CANNON.Vec3(50, 1, 50)));
    groundBody.position.set(0, -1.0, 0); world.addBody(groundBody);
    const matW = new CANNON.Material(); world.addContactMaterial(new CANNON.ContactMaterial(matW, matW, { friction: 3.5, restitution: 0.01 }));

    // RENDERER
    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 0.1, 10000);
    camera.position.set(0, 12, 35);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.485; controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0x1a1a2a, 0x000000, 0.2));
    const fireL = new THREE.PointLight(0xff8800, 0, 70); fireL.position.set(0, 4.0, 0); scene.add(fireL);

    // STARS (v144)
    const starCount = 35000;
    const starGeo = new THREE.BufferGeometry();
    const starPosArr = new Float32Array(starCount * 3);
    const starColArr = new Float32Array(starCount * 3);
    const starSizeArr = new Float32Array(starCount);
    const starRandArr = new Float32Array(starCount);

    for(let i=0; i<starCount; i++) {
        const r = 4000 + Math.random()*4000; const t = Math.random()*6.28, p = Math.acos(2*Math.random()-1);
        starPosArr[i*3]=r*Math.sin(p)*Math.cos(t); starPosArr[i*3+1]=r*Math.sin(p)*Math.sin(t); starPosArr[i*3+2]=r*Math.cos(p);
        starRandArr[i] = Math.random();
        const mag = Math.random(); const color = new THREE.Color();
        if(mag > 0.94) { starSizeArr[i]=4.5+Math.random()*3.5; color.setHSL(0.6, 0.2, 0.9); }
        else if(mag > 0.85) { starSizeArr[i]=3.0+Math.random()*2.0; color.setHSL(0.1, 0.2, 0.9); }
        else { starSizeArr[i]=0.8+Math.random()*0.7; color.setHex(0xaaaaaa); }
        starColArr[i*3]=color.r; starColArr[i*3+1]=color.g; starColArr[i*3+2]=color.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPosArr, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColArr, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(starSizeArr, 1));
    starGeo.setAttribute('aRand', new THREE.BufferAttribute(starRandArr, 1));

    const starMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `
            attribute float size; attribute vec3 color; attribute float aRand; varying vec3 vColor; varying float vTwinkle; uniform float uTime;
            void main() {
                vColor = color;
                vTwinkle = 0.7 + 0.3 * sin(uTime * (0.5 + aRand * 1.5) + aRand * 10.0);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * vTwinkle * (400.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor; varying float vTwinkle;
            void main() {
                float d = distance(gl_PointCoord, vec2(0.5)); if(d > 0.5) discard;
                gl_FragColor = vec4(vColor, (1.0 - pow(d*2.0, 2.0)) * vTwinkle);
            }
        `,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    scene.add(new THREE.Points(starGeo, starMat));



    // GROUND & GRASS
    function createGroundAlphaMap() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(128, 128, 90, 128, 128, 128);
        g.addColorStop(0.0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,1)'); g.addColorStop(1.0, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256); const tex = new THREE.Texture(c); tex.needsUpdate = true; return tex;
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(20, 64), new THREE.MeshStandardMaterial({ color: 0x060504, roughness: 1.0, transparent: true, alphaMap: createGroundAlphaMap(), side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI/2; disc.position.y = -0.01; scene.add(disc);

    const grassCount = 140000; const grassGeo = new THREE.PlaneGeometry(0.12, 0.75, 1, 2);
    const gP = grassGeo.attributes.position.array; for(let i=0; i<gP.length; i+=3) { if(gP[i+1]>0.3) gP[i]*=0.1; }
    grassGeo.translate(0, 0.37, 0);
    const grassMesh = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({vertexColors:true, side:THREE.DoubleSide, roughness:1.0, transparent:true}), grassCount);
    const dummy = new THREE.Object3D();
    for(let i=0; i<grassCount; i++){
        const r = 6.0 + Math.pow(Math.random(), 0.5) * 13.0; const t = Math.random()*6.28;
        dummy.position.set(Math.cos(t)*r, 0, Math.sin(t)*r);
        dummy.rotation.set((Math.random()-0.5)*0.8, Math.random()*Math.PI, (Math.random()-0.5)*0.8);
        dummy.scale.setScalar(0.4 + Math.random()*0.9); dummy.updateMatrix();
        grassMesh.setMatrixAt(i, dummy.matrix);
        const col = new THREE.Color();
        const mix = Math.random();
        if(mix > 0.6) col.setHex(0x142218); else if(mix > 0.2) col.setHex(0x2d3a2b); else col.setHex(0x4a5a40);
        grassMesh.setColorAt(i, col);
    }
    scene.add(grassMesh);

    // FIRE PARTICLES
    function createRefinedTex() {
        const c = document.createElement('canvas'); c.width = 32; c.height = 512; const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(16, 512, 16, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.30, 'rgba(212, 130, 0, 0.45)'); g.addColorStop(0.60, 'rgba(180, 20, 20, 0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(16, 512); ctx.lineTo(14, 200); ctx.lineTo(16, 0); ctx.lineTo(18, 200); ctx.lineTo(16, 512);
        ctx.fill(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(16, 512); ctx.lineTo(16, 0); ctx.stroke();
        const tex = new THREE.Texture(c); tex.needsUpdate = true; return tex;
    }
    const pCount = 600; const pGeo = new THREE.BufferGeometry(); const pPosArr = new Float32Array(pCount * 3); const pLifeArr = new Float32Array(pCount); const pDataArr = new Float32Array(pCount * 4);
    for(let i=0;i<pCount;i++) {
        pPosArr[i*3+1]=-1000; pLifeArr[i] = Math.random();
        pDataArr[i*4] = 1.8 + Math.random() * 3.0; pDataArr[i*4+1] = Math.random() * 6.28;
        const weight = Math.random(); pDataArr[i*4+2] = weight > 0.8 ? (9.0 + Math.random() * 3.0) : (4.0 + Math.random() * 5.0);
        pDataArr[i*4+3] = 0.5 + Math.random() * 3.5;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPosArr, 3)); pGeo.setAttribute('life', new THREE.BufferAttribute(pLifeArr, 1)); pGeo.setAttribute('data', new THREE.BufferAttribute(pDataArr, 4));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: createRefinedTex(), size: 36.0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.18 }));
    particles.frustumCulled = false; scene.add(particles);

    // PILE LOGIC
    let state = { logs: [], fan: 0, temp: 15, strike: 0 };
    function spawnLog(type) {
        let d;
        if(type==='twig') d={n:"Tinder", m:1.0, r:0.07, l:1.2, col:0x6d4c41, maxT: 400, heatSpeed: 1.5};
        else if(type==='wood') d={n:"Kindling", m:6.0, r:0.18, l:2.4, col:0x4e342e, maxT: 850, heatSpeed: 0.8};
        else d={n:"Oak Core", m:35.0, r:0.42, l:3.5, col:0x3e2723, maxT: 1450, heatSpeed: 0.3};

        const body = new CANNON.Body({ mass: d.m, material: matW, linearDamping: 0.9, angularDamping: 0.9 });
        body.addShape(new CANNON.Box(new CANNON.Vec3(d.l/2, d.r, d.r)));
        const angle = Math.random() * Math.PI * 2; const dist = 0.5 + Math.random() * 0.8;
        body.position.set(Math.cos(angle)*dist, 10, Math.sin(angle)*dist);
        body.quaternion.setFromEuler(-(0.5 + Math.random() * 0.8), angle + Math.PI/2, 0);
        world.addBody(body);

        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.l, 12), new THREE.MeshStandardMaterial({color:d.col, roughness:1.0}));
        mesh.rotation.z = Math.PI/2; const group = new THREE.Group(); group.add(mesh); scene.add(group);
        state.logs.push({...d, id:Math.random(), f:d.m, max:d.m, temp:15, isFlame:false, mesh:group, body, mat:mesh.material}); updateUI();
    }
    function removeLog(id) { const idx = state.logs.findIndex(l => l.id === id); if(idx !== -1) { const l = state.logs[idx]; scene.remove(l.mesh); world.remove(l.body); state.logs.splice(idx, 1); updateUI(); } }
    function fan() { state.fan = Math.min(6.0, state.fan + 3.0); }
    function ignite() { state.strike = 10; state.logs.forEach(l => { if(l.n === "Tinder") l.temp = Math.max(l.temp, 350); }); }

    const clock = new THREE.Clock(); let time = 0;
    function animate() {
        requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), 0.05); world.step(1/60, dt, 5); time += dt;
        starMat.uniforms.uTime.value = time;
        let totalHeat = 0; let activeCount = 0;

        for (let i = state.logs.length - 1; i >= 0; i--) {
            const l = state.logs[i]; l.mesh.position.copy(l.body.position); l.mesh.quaternion.copy(l.body.quaternion);
            if(l.body.position.y < 1.5) l.body.applyForce(new CANNON.Vec3(-l.body.position.x*20*l.body.mass, 0, -l.body.position.z*20*l.body.mass), l.body.position);

            state.logs.forEach(o => { if(l!==o && o.isFlame) l.temp += (o.temp * 0.4) * dt / (l.mesh.position.distanceTo(o.mesh.position) + 0.5); });

            if(l.temp > 240 || l.isFlame) {
                l.isFlame = true; activeCount++;
                l.f -= (l.n==="Tinder"?0.3:0.04) * (1 + state.fan*0.5) * dt;
                l.temp = Math.min(l.maxT, l.temp + (120 * l.heatSpeed) * dt);

                // EMBERS & CARBONIZATION LOGIC
                const fuelRatio = Math.max(0, l.f / l.max);
                const charCol = new THREE.Color(0x0a0807); // 숯의 색
                const originalCol = new THREE.Color(l.col);
                l.mat.color.copy(originalCol).lerp(charCol, 1.0 - fuelRatio); // 타면서 검게 변함

                l.mat.emissive.setHex(0xff3300);
                l.mat.emissiveIntensity = (l.temp / 600) * (0.8 + Math.sin(time * 5) * 0.2);

                const s = Math.max(0.1, fuelRatio);
                l.mesh.scale.set(s, 1, s);
                if(l.f <= 0.05) { scene.remove(l.mesh); world.remove(l.body); state.logs.splice(i, 1); updateUI(); }
            }
            if(l.isFlame) totalHeat += l.temp;
        }

        const avgT = activeCount > 0 ? (totalHeat / activeCount) : 15;

        // AUDIO UPDATE
        if(fireGain) {
    const vol = Math.min(1.0, totalHeat / 3000);
    fireGain.gain.setTargetAtTime(vol * 0.5, audioCtx.currentTime, 0.1); // 배경 화염음은 적절히 유지

    // 불이 붙어있는 장작이 하나라도 있다면 소리 실행
    if(totalHeat > 50) {
        playCrackle(vol);
    }
}

        const thermalFactor = Math.min(1.0, Math.max(0.45, (avgT - 240) / 1200));
        const pp = particles.geometry.attributes.position.array; const pl = particles.geometry.attributes.life.array; const pd = particles.geometry.attributes.data.array; const bActive = state.logs.filter(l=>l.isFlame);

        for(let i=0; i<pCount; i++) {
            pl[i] += dt * 0.75; const centerProx = Math.max(0, 1.0 - Math.sqrt(pp[i*3]**2 + pp[i*3+2]**2)*0.4);
            pp[i*3+1] += (pd[i*4] * (1.2 + centerProx * 1.8) + state.fan*2.0) * dt;
            const h = pp[i*3+1]; const swirl = Math.sin(time * pd[i*4+3] + h * 0.6 + pd[i*4+1]) * 0.12 * (1 + h*0.05);
            pp[i*3] += swirl * Math.cos(pd[i*4+1]); pp[i*3+2] += swirl * Math.sin(pd[i*4+1]);
            const termH = Math.min(12.0, (pd[i*4+2] * thermalFactor + state.fan * 2) * (1.0 + centerProx * 0.8));
            if(pl[i] > 1.0 || pp[i*3+1] > termH || Math.random() < 0.01) {
                if(bActive.length > 0) {
                    const src = bActive[Math.floor(Math.random()*bActive.length)];
                    const spread = src.r * (0.7 + Math.random()*0.5); const ang = Math.random()*6.28;
                    pp[i*3] = src.mesh.position.x + Math.cos(ang) * spread; pp[i*3+1] = src.mesh.position.y + 0.25; pp[i*3+2] = src.mesh.position.z + Math.sin(ang) * spread; pl[i] = 0;
                } else pp[i*3+1] = -1000;
            }
        }
        particles.geometry.attributes.position.needsUpdate = true;
        const flicker = (Math.sin(time * 11) + Math.sin(time * 17) + Math.sin(time * 23)) * 0.05;
        fireL.intensity = Math.min(2.8, (totalHeat/1450) * 1.8 + (state.strike > 0 ? 0.15 : 0)) * (7.5 + flicker * 6);
        fireL.position.x = Math.sin(time * 7) * 0.1; fireL.position.z = Math.cos(time * 7) * 0.1;
        grassMesh.rotation.y = Math.sin(time * 0.4) * 0.015;
        state.fan = Math.max(0, state.fan - dt * 2.5); state.strike = Math.max(0, state.strike - 1);
        document.getElementById('ui-temp').innerText = Math.round(avgT)+"°C";
        controls.update(); updateStatus(); renderer.render(scene, camera);
    }

    function updateUI() {
        const l = document.getElementById('log-list'); l.innerHTML = '';
        state.logs.forEach(g => {
            const d = document.createElement('div'); d.className = 'log-item'; d.id = `row-${g.id}`;
            d.innerHTML = `<div><b>${g.n}</b> <span id="s-${g.id}"></span></div><div style="display:flex; align-items:center;"><div class="bar-bg" style="width:60px; margin:0 10px; background:#1a1410"><div id="b-${g.id}" class="bar-f" style="width:100%; background:#d4a373"></div></div><button class="remove-btn" data-remove-id="${g.id}">X</button></div>`;
            l.appendChild(d);
        });
    }
    function updateStatus() {
        state.logs.forEach(l => {
            const r = document.getElementById(`row-${l.id}`); if(!r) return; const s = document.getElementById(`s-${l.id}`); const b = document.getElementById(`b-${l.id}`);
            b.style.width = (l.f/l.max)*100 + "%"; s.innerText = Math.round(l.temp)+"°C"; r.className = l.isFlame ? 'log-item burn' : 'log-item';
        });
    }
    window.addEventListener('resize', ()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
