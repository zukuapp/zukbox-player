# zukbox-player

**ZUKBOX / Next2D Player** — WebGL·WebGPU·OffscreenCanvas를 지원하는 렌더링 플레이어입니다.  
게임·광고·리치 인터랙티브 표현에 사용합니다.

> GitHub: [zukuapp/zukbox-player](https://github.com/zukuapp/zukbox-player)  
> 업스트림: [Next2D/Player](https://github.com/Next2D/Player)

## 역할

- 벡터 · Tween · 텍스트 · 오디오 · 비디오 등 디스플레이 트리 재생
- WebGL2 / WebGPU 가속 · 워커 경로
- ZUKBOX 에디터([zukbox](https://github.com/zukuapp/zukbox))와 `.zwf` 런타임([zukbox-runtime](https://github.com/zukuapp/zukbox-runtime))의 렌더 백엔드

## 패키지

모노레포 `packages/` 아래에 `@next2d/*` (또는 리브랜딩 중인 `@zuku/*`) 코어·렌더러·미디어 등이 있습니다.  
개발 가이드: [`DEVELOP.md`](DEVELOP.md)

## 개발

```bash
npm install
npm run build
npm test
```

## 관련

| 저장소 | 역할 |
|--------|------|
| [zukbox](https://github.com/zukuapp/zukbox) | 저작 도구 |
| [zukbox-lang](https://github.com/zukuapp/zukbox-lang) | 언어 리소스 |
| [zukbox-runtime](https://github.com/zukuapp/zukbox-runtime) | `.zwf` WASM |
| [zuku-engine-next2d](https://github.com/zukuapp/zuku-engine-next2d) | Jump 공개 계약 |

## 라이선스

[MIT](LICENSE) (저장소 LICENSE 기준).

---

**ZUKBOX** · **ZUKU (즈쿠)** · Tresillo · [zuzunza.com](https://zuzunza.com)
