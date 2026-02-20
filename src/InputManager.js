export class InputManager {
    constructor() {
        this.steering = 0; // -1 (Left) to 1 (Right)
        this.gas = 0;      // 0 to 1
        this.brake = 0;    // 0 to 1
        this.wheelAngle = 0;

        this.initSteering();
        this.initPedals();
        this.initKeyboard();
    }

    initSteering() {
        const wheel = document.getElementById('steering-wheel');
        let isHolding = false;

        const handleMove = (e) => {
            if (!isHolding) return;
            const touch = e.touches ? e.touches[0] : e;
            const rect = wheel.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Calculate angle using trigonometry
            const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX);
            this.wheelAngle = angle * (180 / Math.PI);
            
            // Limit rotation to 180 degrees each way
            wheel.style.transform = `rotate(${this.wheelAngle}deg)`;
            this.steering = Math.max(-1, Math.min(1, this.wheelAngle / 90));
        };

        wheel.addEventListener('mousedown', () => isHolding = true);
        wheel.addEventListener('touchstart', () => isHolding = true);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('mouseup', () => { isHolding = false; this.resetWheel(); });
        window.addEventListener('touchend', () => { isHolding = false; this.resetWheel(); });
    }

    resetWheel() {
        this.steering = 0;
        document.getElementById('steering-wheel').style.transform = `rotate(0deg)`;
    }

    initPedals() {
        const gasBtn = document.getElementById('btn-gas');
        const brakeBtn = document.getElementById('btn-brake');

        gasBtn.addEventListener('pointerdown', () => this.gas = 1);
        gasBtn.addEventListener('pointerup', () => this.gas = 0);
        brakeBtn.addEventListener('pointerdown', () => this.brake = 1);
        brakeBtn.addEventListener('pointerup', () => this.brake = 0);
    }

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'w' || e.key === 'ArrowUp') this.gas = 1;
            if (e.key === 's' || e.key === 'ArrowDown') this.brake = 1;
            if (e.key === 'a' || e.key === 'ArrowLeft') this.steering = -1;
            if (e.key === 'd' || e.key === 'ArrowRight') this.steering = 1;
        });
        window.addEventListener('keyup', () => { this.gas = 0; this.brake = 0; this.steering = 0; });
    }
}

