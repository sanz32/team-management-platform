import { describe, it, expect } from "vitest";
import {
  cleanDisplayName,
  suggestTeamName,
  teamBrand,
  teamSlugCandidates,
  isTeamSlug,
  TEAM_SLUG_PREFIX,
} from "./boost-teams";

describe("cleanDisplayName", () => {
  it("convierte las letras decorativas de Discord a letras normales", () => {
    expect(cleanDisplayName("♛𝓥𝓮𝔁♛")).toBe("Vex");
  });

  it("preserva los acentos, que son texto legible", () => {
    expect(cleanDisplayName("Moré")).toBe("Moré");
    expect(cleanDisplayName("'Rávia")).toBe("Rávia");
  });

  it("quita los adornos del principio y del final", () => {
    expect(cleanDisplayName("! SolRiver")).toBe("SolRiver");
    expect(cleanDisplayName("night owl.")).toBe("night owl");
  });

  it("conserva los separadores que de verdad usan los nombres", () => {
    expect(cleanDisplayName("Mr K")).toBe("Mr K");
    expect(cleanDisplayName("mr.kettle")).toBe("mr.kettle");
    expect(cleanDisplayName("pip_wipes")).toBe("pip_wipes");
  });

  it("colapsa los espacios de más", () => {
    expect(cleanDisplayName("  Mic   de  vex ")).toBe("Mic de vex");
  });

  it("devuelve vacío para lo que no deja nada usable", () => {
    expect(cleanDisplayName("♛♛♛")).toBe("");
    expect(cleanDisplayName("")).toBe("");
    expect(cleanDisplayName(null)).toBe("");
    expect(cleanDisplayName(undefined)).toBe("");
  });
});

describe("suggestTeamName", () => {
  it("prefiere el nombre de Discord: es el que el comprador ve en el chat", () => {
    expect(
      suggestTeamName({ globalName: "♛𝓥𝓮𝔁♛", nickname: "Nery", username: "_vex" })
    ).toBe("Vex");
  });

  it("cae al nick del portal si el de Discord no deja nada usable", () => {
    expect(
      suggestTeamName({ globalName: "♛♛", nickname: "Brindle", username: "orbit9090" })
    ).toBe("Brindle");
  });

  it("usa el username técnico solo como último recurso", () => {
    expect(
      suggestTeamName({ globalName: null, nickname: null, username: "fanofvex2731" })
    ).toBe("fanofvex2731");
  });

  it("devuelve vacío si no hay ningún nombre", () => {
    expect(suggestTeamName({})).toBe("");
  });

  it("ignora un nombre de una sola letra", () => {
    expect(suggestTeamName({ globalName: "X", nickname: "Corvo" })).toBe("Corvo");
  });
});

describe("teamBrand", () => {
  it("antepone Team al nombre", () => {
    expect(teamBrand("Vex")).toBe("Team Vex");
    expect(teamBrand("Alfa")).toBe("Team Alfa");
  });

  it("NO duplica el prefijo si la persona ya lo escribió", () => {
    expect(teamBrand("Team Vex")).toBe("Team Vex");
    expect(teamBrand("team alfa")).toBe("team alfa");
  });

  it("distingue 'Team' de un nombre que solo empieza con esas letras", () => {
    expect(teamBrand("Teamo")).toBe("Team Teamo");
  });

  it("cae al nombre del guild sin nombre de team configurado", () => {
    expect(teamBrand(null)).toBe("Team Nova");
    expect(teamBrand("")).toBe("Team Nova");
    expect(teamBrand("♛♛♛")).toBe("Team Nova");
  });

  it("respeta un fallback propio", () => {
    expect(teamBrand(null, "Team Orion")).toBe("Team Orion");
  });
});

describe("teamSlugCandidates", () => {
  it("arma el slug con el prefijo y sin acentos", () => {
    expect(teamSlugCandidates("Vex")[0]).toBe("teamvex");
    expect(teamSlugCandidates("Moré")[0]).toBe("teammore");
  });

  it("resuelve el caso real del nombre decorado", () => {
    expect(teamSlugCandidates("♛𝓥𝓮𝔁♛")[0]).toBe("teamvex");
  });

  it("no duplica el prefijo cuando el nombre ya lo trae", () => {
    expect(teamSlugCandidates("Team Vex")[0]).toBe("teamvex");
  });

  it("usa los respaldos si el nombre no deja nada para una URL", () => {
    expect(teamSlugCandidates("♛♛♛", ["Brindle", "orbit9090"])[0]).toBe("teambrindle");
  });

  it("nunca devuelve solo el prefijo", () => {
    const [primero] = teamSlugCandidates("♛", []);
    expect(primero).toBe("teamnova");
    expect(primero.length).toBeGreaterThan(TEAM_SLUG_PREFIX.length);
  });

  it("ofrece alternativas con sufijo para resolver colisiones", () => {
    const candidatos = teamSlugCandidates("Vex", [], ["a1", "b2"]);
    expect(candidatos[0]).toBe("teamvex");
    expect(candidatos).toHaveLength(3);
    expect(new Set(candidatos).size).toBe(3);
    for (const c of candidatos) expect(c.startsWith(TEAM_SLUG_PREFIX)).toBe(true);
  });

  it("respeta el tope de largo incluso con un nombre larguísimo", () => {
    for (const c of teamSlugCandidates("Starfall El Mas Grande De Todos Los Tiempos", [], ["z9"])) {
      expect(c.length).toBeLessThanOrEqual(24);
    }
  });
});

describe("isTeamSlug", () => {
  it("reconoce un slug de team", () => {
    expect(isTeamSlug("teamvex")).toBe(true);
    expect(isTeamSlug("teambrindle")).toBe(true);
  });

  it("NO confunde el id de un paquete con un team", () => {
    expect(isTeamSlug("596b25d2-fba0-4006-9376-c45ce11a34cc")).toBe(false);
  });

  it("NO pisa las rutas que ya existen en la tienda", () => {
    expect(isTeamSlug("disponible")).toBe(false);
    expect(isTeamSlug("estado")).toBe(false);
  });

  it("rechaza el prefijo pelado y lo que no alcanza el mínimo", () => {
    expect(isTeamSlug("team")).toBe(false);
    expect(isTeamSlug("teama")).toBe(false);
  });

  it("rechaza mayúsculas y símbolos: los slugs se guardan en minúsculas", () => {
    expect(isTeamSlug("TeamVex")).toBe(false);
    expect(isTeamSlug("team-vex")).toBe(false);
    expect(isTeamSlug("team vex")).toBe(false);
  });

  it("no explota con nada", () => {
    expect(isTeamSlug(null)).toBe(false);
    expect(isTeamSlug(undefined)).toBe(false);
    expect(isTeamSlug("")).toBe(false);
  });
});
