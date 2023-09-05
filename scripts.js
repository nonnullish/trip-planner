const state = {
  days: [],
  data: [],
  annotations: L.featureGroup([]),
};

// set up dayjs
dayjs.extend(dayjs_plugin_minMax);
dayjs.extend(dayjs_plugin_utc);

// set up input panel
codeInput.registerTemplate("syntax-highlighted", codeInput.templates.prism(Prism, [new codeInput.plugins.Indent()]));

// set up the map
const map = L.map("map").setView([0, 0], 2);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "OpenStreetMap" }).addTo(map);
document.querySelector("#main").addEventListener("sl-reposition", () => map.invalidateSize());

// set up the dialog
const dialog = document.querySelector("sl-dialog");

dialog.addEventListener("sl-request-close", (event) => {
  if (event.detail.source === "overlay") {
    event.preventDefault();
  }
});

if (localStorage.getItem("data")) {
  document.querySelector("#load").toggleAttribute("disabled");
}

document.querySelector("#load").addEventListener("click", () => {
  document.querySelector("code-input").value = JSON.stringify(JSON.parse(localStorage.getItem("data")), null, 2);
  handleData(JSON.parse(localStorage.getItem("data")));
  showPlans();
  dialog.hide();
});

document.querySelector("#import").addEventListener("change", ({ target }) => {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      const data = JSON.parse(reader.result);
      document.querySelector("code-input").value = JSON.stringify(data, null, 2);
      handleData(data);
      showPlans();
      dialog.hide();
    } catch (error) {
      const alert = Object.assign(document.createElement("sl-alert"), {
        variant: "warning",
        closable: true,
        duration: 3000,
        innerHTML: `There's something wrong with the file.<br/>Error says: ${error.message}.`,
      });

      document.body.append(alert);
      alert.toast();
      throw error;
    }
  });

  reader.readAsText(target.files[0]);
});

document.querySelector("#create-new").addEventListener("click", () => {
  dialog.hide();
});

document.querySelector("#show-demo").addEventListener("click", () => {
  document.querySelector("code-input").value = JSON.stringify(demo, null, 2);
  handleData(demo);
  showPlans();
  dialog.hide();
});

// set up toolbox
document.querySelector("#update").addEventListener("click", () => {
  state.annotations.clearLayers();
  try {
    handleData(JSON.parse(document.querySelector("code-input").value));
    document.querySelector("#update").innerText = "✓";
    setTimeout(() => {
      document.querySelector("#update").innerText = "Update";
    }, 2000);
  } catch (error) {
    const alert = Object.assign(document.createElement("sl-alert"), {
      variant: "warning",
      closable: true,
      duration: 3000,
      innerHTML: `There's something wrong with the input.<br/>Error says: ${error.message}.`,
    });

    document.body.append(alert);
    alert.toast();
    throw error;
  }

  showPlans();
});

document.querySelector("#share").addEventListener("click", () => {
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(state.data))));
  const url = new URL(window.location);
  url.searchParams.set("data", base64);
  try {
    navigator.clipboard.writeText(url.toString());
  } catch (e) {
    try {
      const blob = new Blob(url.toString(), { type: "text/plain" });
      navigator.clipboard.write(blob);
    } catch (e) {}
  }
  document.querySelector("#share").innerText = "✓";
  setTimeout(() => {
    document.querySelector("#share").innerText = "Share";
  }, 2000);
});

document.querySelector("#save").addEventListener("click", () => {
  localStorage.setItem("data", document.querySelector("code-input").value);
  document.querySelector("#save").innerText = "✓";
  setTimeout(() => {
    document.querySelector("#save").innerText = "Save";
  }, 2000);
});

document.querySelector("#download").addEventListener("click", () => {
  const link = document.createElement("a");
  const file = new Blob([document.querySelector("code-input").value], { type: "text/plain" });
  link.href = URL.createObjectURL(file);
  link.download = "itinerary.json";
  link.click();
  URL.revokeObjectURL(link.href);

  document.querySelector("#download").innerText = "✓";
  setTimeout(() => {
    document.querySelector("#download").innerText = "Save";
  }, 2000);
});

// handle data
const handleData = ({ itinerary, ...rest }) => {
  state.data = { ...rest, itinerary: itinerary.sort((a, b) => (dayjs(a.day).isAfter(b.day) ? 1 : -1)) };
  state.days = [
    ...new Set(
      [state.data.stay, state.data.arrival, state.data.departure, ...state.data.itinerary]
        .filter(({ day }) => Boolean(day))
        .map(({ day }) => dayjs(day))
        .sort((a, b) => (a.isAfter(b) ? 1 : -1))
        .map((day) => day.format("DD MMM YYYY"))
    ),
  ];

  document.querySelector("#values").innerHTML = "";
  state.days.forEach((day, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.label = day;
    document.querySelector("#values").append(option);
    document.querySelector("tc-range-slider").setAttribute("max", state.days.length - 1);
  });

  if (state.days.length > 1) {
    document.querySelector(".day-selector").hidden = false;
  } else {
    document.querySelector(".day-selector").hidden = true;
  }
};

// handle day input
document.querySelector("#dates").addEventListener("change", ({ target }) => {
  const index = Number(target.value);
  state.annotations.clearLayers();
  showPlans(state.data, index);
});

const createElement = ({ text, className, type = "p" }) => {
  const element = document.createElement(type);
  if (text) {
    element.innerHTML = text;
  }
  if (className) {
    element.className = className;
  }
  return element;
};

const createDescription = ({ name, coords, day, ...rest }) => {
  const description = createElement({ className: "description", type: "div" });
  description.append(createElement({ text: name, type: "h3" }));

  for (const [key, value] of Object.entries(rest)) {
    description.append(createElement({ text: `<b>${key}</b>: ${value}` }));
  }

  if (day) {
    description.append(createElement({ text: `<b>time</b>: ${dayjs(day).format("HH:mm")}` }));
  }

  return description;
};

const createPin = (element) => {
  const description = createDescription(element);

  return L.popup(element.coords, {
    closeButton: false,
    autoClose: false,
    closeOnEscapeKey: false,
    closeOnClick: false,
    content: description.outerHTML,
  });
};

const showPlans = (data = state.data, index = Number(document.querySelector("#dates").value)) => {
  const itinerary = [
    ...(index === 0 ? [data.arrival] : []),
    data.stay,
    ...data.itinerary.filter(({ day }) => dayjs(day).isSame(state.days[index], "day")),
    ...(index !== state.days.length - 1 ? [data.stay] : []),
    ...(index === state.days.length - 1 ? [data.departure] : []),
  ];

  itinerary.forEach((plan) => {
    state.annotations.addLayer(createPin(plan));
  });

  const path = L.polyline(
    itinerary.map(({ coords }) => coords),
    { color: "white" }
  );

  const arrows = L.polylineDecorator(path, {
    patterns: [
      {
        offset: 0,
        repeat: 20,
        symbol: L.Symbol.arrowHead({
          pixelSize: 10,
          polygon: false,
          pathOptions: { stroke: true, color: "white" },
        }),
      },
    ],
  });

  state.annotations.addTo(map);
  map.fitBounds(state.annotations.getBounds(), { padding: [100, 100] });

  state.annotations.addLayer(path);
  state.annotations.addLayer(arrows);
};

const params = new URL(document.location).searchParams;

if (params.get("data")) {
  try {
    document.querySelector("#main").setAttribute("position", 100);
    document.querySelector("#main").setAttribute(
      "style",
      `--min: 350px; grid-template-columns: clamp(0%,
    clamp(
      var(--min),
      100% - var(--divider-width) / 2,
      var(--max)
    ), calc(100% - var(--divider-width))) var(--divider-width) auto;`
    );

    const sharedData = JSON.parse(decodeURIComponent(escape(atob(params.get("data")))));
    document.querySelector("code-input").value = JSON.stringify(sharedData, null, 2);
    handleData(sharedData);
    showPlans();
    dialog.hide();
  } catch (error) {
    const alert = Object.assign(document.createElement("sl-alert"), {
      variant: "warning",
      closable: true,
      duration: 3000,
      innerHTML: `There's something wrong with the data.<br/>Error says: ${error.message}.`,
    });

    document.body.append(alert);
    alert.toast();
    throw error;
  }
} else {
  document.querySelector("sl-dialog").toggleAttribute("open");
}
