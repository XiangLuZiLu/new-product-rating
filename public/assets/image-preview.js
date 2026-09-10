
(function () {
  function fixUrl(url) {
    if (!url) return "";
    return String(url).replace(
      /^http:\/\/xianglu\.dragon-sturgeon\.cn/i,
      "https://xianglu.dragon-sturgeon.cn"
    );
  }

  function openImagePreview(url) {
    url = fixUrl(url);
    if (!url) return;

    let box = document.querySelector(".image-preview-mask");
    if (!box) {
      box = document.createElement("div");
      box.className = "image-preview-mask";
      box.innerHTML = '<img class="image-preview-image">';
      document.body.appendChild(box);

      box.addEventListener("click", function () {
        box.classList.remove("show");
      });

      document.addEventListener("keydown", function(e){
        if(e.key === "Escape"){
          box.classList.remove("show");
        }
      });
    }

    const img = box.querySelector(".image-preview-image");
    img.src = url;
    img.classList.remove("zoom");
    box.classList.add("show");

    img.onclick = function(e){
      e.stopPropagation();
      img.classList.toggle("zoom");
    };
  }

  window.openImagePreview = openImagePreview;

  document.addEventListener("click", function(e){
    const el = e.target.closest("[data-preview-image]");
    if(el){
      openImagePreview(el.dataset.previewImage || el.src);
    }
  });
})();
