var STORAGE_KEY = "looptube_progress";
    var tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    var player;
    var saveInterval;

    // Registra teclas de mídia no Tizen (quando disponível)
    try {
      if (window.tizen && tizen.tvinputdevice) {
        tizen.tvinputdevice.registerKey("MediaPlayPause");
        tizen.tvinputdevice.registerKey("MediaPlay");
        tizen.tvinputdevice.registerKey("MediaPause");
      }
    } catch (e) {
      console.log("Não foi possível registrar teclas de mídia:", e);
    }

    // Salva progresso no localStorage
    function saveProgress() {
      if (!player) return;
      try {
        var state = player.getPlayerState();
        // Só salva se estiver tocando ou pausado
        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED) {
          var progress = {
            videoId: player.getVideoData().video_id,
            time: Math.floor(player.getCurrentTime()),
            playlistIndex: player.getPlaylistIndex()
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        }
      } catch (e) {
        console.log("Erro ao salvar progresso:", e);
      }
    }

    // Carrega progresso salvo
    function loadProgress() {
      try {
        var saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
      } catch (e) {
        return null;
      }
    }

    function onYouTubeIframeAPIReady() {
      var progress = loadProgress();

      player = new YT.Player("player", {
        width: "100%",
        height: "100%",
        playerVars: {
          listType: "playlist",
          list: "PLw35prD_PecItXU8QwU7dKDBqeGkYDbsQ",
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          loop: 1,
          enablejsapi: 1,
          vq: "hd1080",
          // Se havia progresso, inicia no índice salvo
          index: progress ? progress.playlistIndex : 0,
          origin: window.location.origin
        },
        events: {
          onReady: function (e) {
            e.target.setVolume(100);

            // Se havia progresso, busca o tempo salvo
            if (progress) {
              console.log("Retomando do índice", progress.playlistIndex, "em", progress.time, "s");
              e.target.seekTo(progress.time, true);
            }

            e.target.playVideo();

            // Salva a cada 5 segundos
            saveInterval = setInterval(saveProgress, 5000);
          },
          onError: function (e) {
            console.log("Erro:", e.data);
            if (e.data === 150 || e.data === 153) {
              setTimeout(function () { e.target.nextVideo(); }, 500);
            }
          },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.ENDED) {
              // Limpa progresso ao terminar o vídeo
              localStorage.removeItem(STORAGE_KEY);
              e.target.playVideo();
            }
            // Salva imediatamente ao pausar
            if (e.data === YT.PlayerState.PAUSED) {
              saveProgress();
            }
          }
        }
      });
    }

    // Salva ao fechar/sair
    window.addEventListener("beforeunload", function () {
      saveProgress();
      clearInterval(saveInterval);
    });

    // Controle remoto
    document.addEventListener("keydown", function (e) {
      if (!player) return;

      var key = e.keyName || e.key || "";
      var code = e.keyCode || e.which;
      var handled = false;

      // Play/Pause (OK, Enter, Space, mídia)
      if (
        key === "Enter" || key === "OK" || key === "MediaPlayPause" ||
        key === "MediaPlay" || key === "MediaPause" ||
        key === " " || key === "Spacebar" || code === 13 || code === 415 || code === 19
      ) {
        handled = true;
        try {
          var state = player.getPlayerState();
          if (state === YT.PlayerState.PLAYING) {
            player.pauseVideo();
          } else {
            player.playVideo();
          }
        } catch (_) {}
      }
      // Próximo
      else if (key === "ArrowRight" || key === "MediaFastForward" || code === 39 || code === 417) {
        handled = true;
        localStorage.removeItem(STORAGE_KEY);
        player.nextVideo();
      }
      // Anterior
      else if (key === "ArrowLeft" || key === "MediaRewind" || code === 37 || code === 412) {
        handled = true;
        localStorage.removeItem(STORAGE_KEY);
        player.previousVideo();
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Botão voltar (Tizen)
    document.addEventListener("tizenhwkey", function (e) {
      if (e.keyName === "back") {
        saveProgress();
        clearInterval(saveInterval);
        try { tizen.application.getCurrentApplication().exit(); }
        catch (_) { window.close(); }
      }
    });